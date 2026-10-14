import { randomUUID } from 'crypto';
import { adminDb } from '../firebaseAdmin';
import { normalizeName } from '../names';
import type { LeaderboardEntry, SessionPayload, Tab } from '../types';
import type { MeResponse, RunResult, StartResponse } from '../apiTypes';
import { startGame } from './index';
import { CONTENT_COUNT, contentKeys, isContentGame, pickFresh, SEEN_TTL_MS, servedFrom, type ContentGame, type SeenRecord } from './content';
import { applyRunToEntry, computeRank, gamesPlayedOf, isLive, liveEntries, sumBests } from './ranking';
import { RUN_TTL_MS, RunError, toStorable, type RunRecord } from './shared';
import { transition, type Transition } from './transition';

type Json = Record<string, unknown>;

/** Starts a fresh run of one game. The previous run of the same game in this session is abandoned. */
/**
 * Picks content this player has not been served yet. The seen record is read and written in one
 * transaction, so two starts at the same moment cannot be given the same questions.
 */
async function pickContent(normKey: string, game: ContentGame, now: number): Promise<Array<number | string>> {
  const box: { picked?: Array<number | string> } = {};
  await adminDb.ref(`seen/${normKey}/${game}`).transaction((current) => {
    const served = servedFrom(current, now);
    const result = pickFresh(contentKeys(game), served, CONTENT_COUNT[game]);
    box.picked = result.picked;
    const record: SeenRecord = { served: result.served, expiresAt: now + SEEN_TTL_MS };
    return toStorable(record);
  });
  if (!box.picked) throw new Error('seen transaction did not run');
  return box.picked;
}

export async function startRun(session: SessionPayload, game: Tab, now: number): Promise<StartResponse> {
  const runId = randomUUID();
  const normKey = normalizeName(session.name);
  const picked = isContentGame(game) ? await pickContent(normKey, game, now) : undefined;
  const { state, view } = startGame(game, picked);
  const run: RunRecord = {
    sessionId: session.sessionId,
    game,
    normKey,
    name: session.name,
    startedAt: now,
    lastActionAt: now,
    status: 'active',
    expiresAt: now + RUN_TTL_MS,
    state,
  };
  await adminDb.ref(`runs/${runId}`).set(toStorable(run));

  // Swap the active pointer atomically and learn which run it replaced.
  const pointer = adminDb.ref(`runs-active/${session.sessionId}_${game}`);
  const swapped: { previous: string | null } = { previous: null };
  await pointer.transaction((current) => {
    swapped.previous = typeof current === 'string' ? current : null;
    return runId;
  });

  const previous = swapped.previous;
  if (previous && previous !== runId) {
    await abandonOrSettle(previous, session, now);
  }

  return { runId, view };
}

/**
 * Retires the run that a new start replaced. An active run is abandoned. A finished run whose
 * score never reached the leaderboard is settled now, because the player cannot come back to it.
 */
async function abandonOrSettle(runId: string, session: SessionPayload, now: number): Promise<void> {
  const snap = await adminDb.ref(`runs/${runId}`).get();
  const prior = snap.val() as RunRecord | null;
  if (!prior) return;

  if (prior.status === 'active') {
    await adminDb.ref(`runs/${runId}`).transaction((current) => {
      if (current === null || current === undefined) return null;
      const old = current as RunRecord;
      if (old.status !== 'active') return undefined;
      return { ...old, status: 'abandoned' };
    });
    return;
  }

  if (prior.status === 'done' && prior.final && !prior.final.settled) {
    try {
      await completeRun(runId, prior, session, now);
    } catch (err) {
      // Left unsettled, so a later retry can still record it. Starting a new game must not fail.
      console.error('Could not settle a finished run', err);
    }
  }
}

interface LeaderboardEvent {
  normKey: string;
  name: string;
  game: Tab;
  score: number;
  issuedAt: number;
  now: number;
}

export interface BoardSnapshot {
  best: number;
  improved: boolean;
  total: number;
  rank: number;
  gamesPlayed: Tab[];
}

/** Records one finished run on the player's leaderboard entry and returns where they now stand. */
async function recordOnLeaderboard(event: LeaderboardEvent): Promise<BoardSnapshot> {
  const ref = adminDb.ref(`leaderboard/${event.normKey}`);
  const applied: { outcome?: ReturnType<typeof applyRunToEntry> } = {};
  await ref.transaction((current) => {
    const outcome = applyRunToEntry(current as LeaderboardEntry | null, {
      name: event.name,
      game: event.game,
      score: event.score,
      now: event.now,
      issuedAt: event.issuedAt,
    });
    applied.outcome = outcome;
    return outcome.entry;
  });
  const outcome = applied.outcome;
  if (!outcome) throw new Error('leaderboard transaction did not run');

  const snap = await adminDb.ref('leaderboard').get();
  const all = Object.values((snap.val() ?? {}) as Record<string, LeaderboardEntry>);
  const rank = computeRank(liveEntries(all, event.now), event.now, outcome.entry.score, outcome.entry.timestamp);
  return {
    best: outcome.best,
    improved: outcome.improved,
    total: outcome.entry.score,
    rank,
    gamesPlayed: gamesPlayedOf(outcome.entry.games ?? {}),
  };
}

/**
 * Builds the response for a finished run: records the score (idempotent, so retrying is safe)
 * and marks the run settled.
 */
async function completeRun(runId: string, run: RunRecord, session: SessionPayload, now: number): Promise<Json> {
  const final = run.final;
  if (!final) throw new Error('completeRun called on a run that has not finished');

  const board = await recordOnLeaderboard({
    normKey: run.normKey,
    name: run.name,
    game: run.game,
    score: final.score,
    issuedAt: session.issuedAt,
    now,
  });
  if (!final.settled) await adminDb.ref(`runs/${runId}/final/settled`).set(true);

  const result: RunResult = {
    game: run.game,
    score: final.score,
    best: board.best,
    improved: board.improved,
    total: board.total,
    rank: board.rank,
    gamesPlayed: board.gamesPlayed,
  };
  return { ...final.response, done: true, result };
}

/** Applies one action to a run inside a single transaction on runs/{runId}. */
export async function performAction(
  session: SessionPayload,
  runId: string,
  body: Json,
  now: number,
): Promise<Json> {
  // The callback can run more than once; only the last invocation describes the outcome.
  const last: { missing?: true; error?: RunError; t?: Transition } = {};
  const { committed } = await adminDb.ref(`runs/${runId}`).transaction((current) => {
    if (current === null || current === undefined) {
      last.missing = true;
      last.error = undefined;
      last.t = undefined;
      return null; // no-op write: if the run really exists, the server rejects this and retries
    }
    try {
      const t = transition(current as RunRecord, session.sessionId, body, now);
      last.missing = undefined;
      last.error = undefined;
      last.t = t;
      return t.kind === 'applied' ? toStorable(t.next) : undefined;
    } catch (err) {
      if (!(err instanceof RunError)) throw err;
      last.missing = undefined;
      last.error = err;
      last.t = undefined;
      return undefined;
    }
  });

  if (last.missing) throw new RunError(404, 'Run not found');
  if (last.error) throw last.error;
  const t = last.t;
  if (!t) throw new RunError(409, 'Please try again');

  if (t.kind === 'settle') {
    return completeRun(runId, t.run, session, now);
  }
  if (!committed) throw new RunError(409, 'Please try again');
  if (!t.finished) return { ...t.response, done: false };
  return completeRun(runId, t.next, session, now);
}

/** The player's bests, total and rank. Uses the leaderboard entry keyed by their name. */
export async function getMe(session: SessionPayload, now: number): Promise<MeResponse> {
  const snap = await adminDb.ref('leaderboard').get();
  const all = (snap.val() ?? {}) as Record<string, LeaderboardEntry>;
  const normKey = normalizeName(session.name);
  const mine = all[normKey];
  if (!isLive(mine, now)) {
    return { name: session.name, total: 0, rank: null, bests: {} };
  }
  const bests = mine.games ?? {};
  const total = sumBests(bests);
  const played = gamesPlayedOf(bests).length > 0;
  return {
    name: session.name,
    total,
    rank: played ? computeRank(liveEntries(Object.values(all), now), now, total, mine.timestamp) : null,
    bests,
  };
}
