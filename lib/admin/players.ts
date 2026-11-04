import { adminDb } from '../firebaseAdmin';
import { TABS, type LeaderboardEntry, type Tab } from '../types';
import { gamesPlayedOf, isLive, sumBests } from '../runs/ranking';
import { readEventStart, roundIndex } from '../event';

export type GameEdits = Partial<Record<Tab, number>>;

export interface AdminPlayer {
  key: string;
  name: string;
  score: number;
  games: GameEdits;
  gamesPlayed: number;
  finished: boolean;
  finishedAt: number | null;
  finishedRound: number | null;
  timestamp: number;
}

const KEY_PATTERN = /^[a-z0-9_]{1,30}$/;
const PHONE_KEY_PATTERN = /^\d{6,20}$/;
const MAX_GAME_SCORE = 5000;

/** Checks the games object sent by the admin page. Only the games themselves can be changed. */
export function parseGameEdits(value: unknown): { ok: true; edits: GameEdits } | { ok: false; error: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'games must be an object' };
  }
  const edits: GameEdits = {};
  for (const [key, score] of Object.entries(value as Record<string, unknown>)) {
    if (!TABS.includes(key as Tab)) return { ok: false, error: 'Unknown game' };
    if (score === undefined) continue;
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_GAME_SCORE) {
      return { ok: false, error: 'Scores must be whole numbers from 0 to 5000' };
    }
    edits[key as Tab] = score;
  }
  if (Object.keys(edits).length === 0) return { ok: false, error: 'Give at least one score to change' };
  return { ok: true, edits };
}

/** The entry with the edited game scores applied, its total and its timestamp recomputed. Pure. */
export function applyGameEdits(entry: LeaderboardEntry, edits: GameEdits, now: number): LeaderboardEntry {
  const games: GameEdits = { ...(entry.games ?? {}) };
  for (const tab of TABS) {
    const value = edits[tab];
    if (value !== undefined) games[tab] = value;
  }
  const score = sumBests(games);
  const timestamp = score > entry.score ? now : entry.timestamp;
  const finishedAt = TABS.every((tab) => typeof games[tab] === 'number')
    ? typeof entry.finishedAt === 'number'
      ? entry.finishedAt
      : now
    : undefined;

  const next: LeaderboardEntry = { name: entry.name, score, games, timestamp, expiresAt: entry.expiresAt };
  // The database rejects undefined values, so the key is added only when there is a time.
  if (finishedAt !== undefined) next.finishedAt = finishedAt;
  return next;
}

export function toAdminPlayer(key: string, entry: LeaderboardEntry, startedAt: number | null): AdminPlayer {
  return {
    key,
    name: entry.name,
    score: entry.score,
    games: { ...entry.games },
    gamesPlayed: gamesPlayedOf(entry.games ?? {}).length,
    finished: typeof entry.finishedAt === 'number',
    finishedAt: typeof entry.finishedAt === 'number' ? entry.finishedAt : null,
    finishedRound:
      typeof entry.finishedAt === 'number' && startedAt !== null ? roundIndex(startedAt, entry.finishedAt) : null,
    timestamp: entry.timestamp,
  };
}

/** Every live player, highest score first. */
export async function listPlayers(now: number): Promise<AdminPlayer[]> {
  const [snap, event] = await Promise.all([adminDb.ref('leaderboard').get(), readEventStart()]);
  const data = (snap.val() ?? {}) as Record<string, LeaderboardEntry>;
  const players = Object.entries(data)
    .filter(([, entry]) => isLive(entry, now))
    .map(([key, entry]) => toAdminPlayer(key, entry, event.startedAt));
  return players.sort(
    (a, b) =>
      b.score - a.score ||
      a.timestamp - b.timestamp ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

/** Applies new game scores to a live player in one transaction. Null when the player is not found. */
export async function editPlayerGames(key: string, edits: GameEdits, now: number): Promise<AdminPlayer | null> {
  if (!KEY_PATTERN.test(key)) return null;
  const ref = adminDb.ref(`leaderboard/${key}`);
  const { committed } = await ref.transaction((current) => {
    const entry = current as LeaderboardEntry | null;
    if (!entry || !isLive(entry, now)) return undefined;
    return applyGameEdits(entry, edits, now);
  });
  if (!committed) return null;

  const [snap, event] = await Promise.all([ref.get(), readEventStart()]);
  const stored = snap.val() as LeaderboardEntry | null;
  if (!isLive(stored, now)) return null;
  return toAdminPlayer(key, stored, event.startedAt);
}

function exists(snap: { val(): unknown }): boolean {
  return snap.val() !== null && snap.val() !== undefined;
}

/**
 * Removes a player everywhere their name or phone number is stored. Returns the kinds of record
 * removed (no phone digits), or null when the key is invalid or nothing was stored under it.
 */
export async function deletePlayer(key: string): Promise<string[] | null> {
  if (!KEY_PATTERN.test(key)) return null;

  const [board, name, contact, seen, phonesSnap] = await Promise.all([
    adminDb.ref(`leaderboard/${key}`).get(),
    adminDb.ref(`names/${key}`).get(),
    adminDb.ref(`contacts/${key}`).get(),
    adminDb.ref(`seen/${key}`).get(),
    adminDb.ref('phones').get(),
  ]);

  const phones = (phonesSnap.val() ?? {}) as Record<string, { normKey?: unknown } | null>;
  const phoneKeys = Object.entries(phones)
    .filter(([phoneKey, entry]) => PHONE_KEY_PATTERN.test(phoneKey) && !!entry && entry.normKey === key)
    .map(([phoneKey]) => phoneKey);

  const removed: string[] = [];
  if (exists(board)) {
    await adminDb.ref(`leaderboard/${key}`).remove();
    removed.push('leaderboard');
  }
  if (exists(name)) {
    await adminDb.ref(`names/${key}`).remove();
    removed.push('name');
  }
  if (exists(contact)) {
    await adminDb.ref(`contacts/${key}`).remove();
    removed.push('contact');
  }
  if (exists(seen)) {
    await adminDb.ref(`seen/${key}`).remove();
    removed.push('seen');
  }
  for (const phoneKey of phoneKeys) {
    await adminDb.ref(`phones/${phoneKey}`).remove();
    removed.push('phone');
  }

  return removed.length > 0 ? removed : null;
}
