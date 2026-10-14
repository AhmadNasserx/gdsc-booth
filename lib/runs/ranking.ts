import { TABS, type LeaderboardEntry, type Tab } from '../types';
import { LEADERBOARD_TTL_MS } from './shared';

export function isLive(entry: LeaderboardEntry | null | undefined, now: number): entry is LeaderboardEntry {
  return !!entry && typeof entry.expiresAt === 'number' && entry.expiresAt > now;
}

export function liveEntries(all: Iterable<LeaderboardEntry | null | undefined>, now: number): LeaderboardEntry[] {
  const out: LeaderboardEntry[] = [];
  for (const entry of all) if (isLive(entry, now)) out.push(entry);
  return out;
}

/** A player's total is the sum of their best score in each game. */
export function sumBests(games: Partial<Record<Tab, number>>): number {
  return Object.values(games).reduce<number>((sum, score) => sum + (score ?? 0), 0);
}

/** Games with a recorded best, in TABS order. A best of 0 still counts as played. */
export function gamesPlayedOf(games: Partial<Record<Tab, number>>): Tab[] {
  return TABS.filter((tab) => games[tab] !== undefined);
}

export interface RunOutcome {
  entry: LeaderboardEntry;
  /** This player's best for the game after the run. */
  best: number;
  /** The run beat the previous best for the game (a first game counts only if it scored). */
  improved: boolean;
}

/**
 * Folds one finished run into the player's leaderboard entry. Pure.
 * - An expired entry counts as no entry, so the player starts again from zero.
 * - The game's best only goes up. The total is the sum of the bests.
 * - `timestamp` moves to `now` only when the total goes up, so earlier totals win ties.
 * - `expiresAt` never moves back: the later of the old value and issuedAt + 48h.
 */
export function applyRunToEntry(
  current: LeaderboardEntry | null | undefined,
  input: { name: string; game: Tab; score: number; now: number; issuedAt: number },
): RunOutcome {
  const base = isLive(current, input.now) ? current : null;
  const games: Partial<Record<Tab, number>> = { ...(base?.games ?? {}) };
  const previous = games[input.game];
  const best = Math.max(previous ?? 0, input.score);
  games[input.game] = best;

  const total = sumBests(games);
  const timestamp = base === null || total > base.score ? input.now : base.timestamp;
  const boardExpiresAt = input.issuedAt + LEADERBOARD_TTL_MS;
  const expiresAt = Math.max(base?.expiresAt ?? 0, boardExpiresAt);

  return {
    entry: { name: input.name, score: total, games, timestamp, expiresAt },
    best,
    improved: input.score > (previous ?? 0),
  };
}

/**
 * 1-based rank of a player with the given total and timestamp.
 * Rank = 1 + entries with a higher total, plus entries with the same total that reached it earlier.
 * The entry itself never counts, so it can be included in `entries` or not.
 */
export function computeRank(entries: readonly LeaderboardEntry[], now: number, total: number, timestamp: number): number {
  let ahead = 0;
  for (const e of entries) {
    if (!isLive(e, now)) continue;
    if (e.score > total || (e.score === total && e.timestamp < timestamp)) ahead++;
  }
  return ahead + 1;
}
