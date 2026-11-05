import { TABS, type LeaderboardEntry } from './types';
import type { RoundTop } from './apiTypes';
import { adminDb } from './firebaseAdmin';

// ---- Pure helpers (no Firebase here) ----

/** One prize hour. */
export const ROUND_MS = 20 * 60 * 1000;

export interface EventState { startedAt: number | null }

/** 0 before the event starts, then 1, 2, 3... for each hour from startedAt. Each hour includes its start and excludes its end. */
export function roundIndex(startedAt: number, t: number): number {
  if (t < startedAt) return 0;
  return Math.floor((t - startedAt) / ROUND_MS) + 1;
}

/** The window of hour n. The end is exclusive, so it is also the start of hour n + 1. */
export function roundWindow(startedAt: number, n: number): { start: number; end: number } {
  const start = startedAt + (n - 1) * ROUND_MS;
  return { start, end: start + ROUND_MS };
}

/** The hour now running. Before the event starts it is still hour 1. Null until the first player starts. */
export function currentRound(startedAt: number | null, now: number): number | null {
  if (startedAt === null) return null;
  return Math.max(1, roundIndex(startedAt, now));
}

/** Milliseconds until the current hour ends. Null until the first player starts. */
export function msUntilRoundEnd(startedAt: number | null, now: number): number | null {
  if (startedAt === null) return null;
  const round = currentRound(startedAt, now) as number;
  return Math.max(0, roundWindow(startedAt, round).end - now);
}

/**
 * The top `count` players of hour n. Only players who finished all three games, in hour n by
 * their finishedAt, are eligible. Ties on score go to the earlier timestamp, then the earlier finishedAt, then name.
 */
export function topOfRound(entries: readonly LeaderboardEntry[], startedAt: number, n: number, count = 3): RoundTop[] {
  const eligible = entries.filter(
    (entry) =>
      typeof entry.finishedAt === 'number' &&
      roundIndex(startedAt, entry.finishedAt) === n &&
      TABS.every((tab) => typeof entry.games?.[tab] === 'number'),
  );
  eligible.sort(
    (a, b) =>
      b.score - a.score ||
      a.timestamp - b.timestamp ||
      (a.finishedAt as number) - (b.finishedAt as number) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return eligible.slice(0, count).map((entry, index) => ({ name: entry.name, score: entry.score, rank: index + 1 }));
}

// ---- Server helpers (Firebase Admin) ----

/** Reads the event start from the database. Null when no player has started yet. */
export async function readEventStart(): Promise<EventState> {
  const snap = await adminDb.ref('event/startedAt').get();
  const value = snap.val();
  return { startedAt: typeof value === 'number' ? value : null };
}

/**
 * Sets the event start to `now` if nothing is stored yet, and returns the stored value. Once set,
 * the value never moves.
 */
export async function ensureEventStarted(now: number): Promise<number> {
  const ref = adminDb.ref('event/startedAt');
  const box = { startedAt: now };
  await ref.transaction((current) => {
    if (typeof current === 'number') {
      box.startedAt = current;
      return undefined;
    }
    box.startedAt = now;
    return now;
  });
  return box.startedAt;
}
