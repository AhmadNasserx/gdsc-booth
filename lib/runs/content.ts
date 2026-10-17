import { BUG_POOL, RIDDLE_POOL } from '../questions';
import type { Tab } from '../types';
import { listOf, secureRandomInt, shuffle, type RandomInt } from './shared';

/** How long a player's record of served content is kept. Refreshed on every start of that game. */
export const SEEN_TTL_MS = 48 * 60 * 60 * 1000;

/** Games whose content is drawn from a pool and never repeated for the same player. */
export const CONTENT_COUNT = { riddles: 5, bugs: 5 } as const;
export type ContentGame = keyof typeof CONTENT_COUNT;

export function isContentGame(game: Tab): game is ContentGame {
  return game in CONTENT_COUNT;
}

/** Everything a player can be served from this game's pool: pool indices. */
export function contentKeys(game: ContentGame): Array<number | string> {
  switch (game) {
    case 'riddles': return RIDDLE_POOL.map((_, i) => i);
    case 'bugs': return BUG_POOL.map((_, i) => i);
  }
}

/** Shape of seen/{normKey}/{game}. */
export interface SeenRecord {
  served: Array<number | string>;
  expiresAt: number;
}

/** What the player has been served. An expired record counts as nothing served. */
export function servedFrom(raw: unknown, now: number): Array<number | string> {
  if (!raw || typeof raw !== 'object') return [];
  const record = raw as Partial<SeenRecord>;
  if (typeof record.expiresAt !== 'number' || record.expiresAt <= now) return [];
  return listOf<number | string>(record.served);
}

/**
 * Chooses `n` keys the player has not been served yet. Pure.
 * - If enough unseen keys remain, pick only from those and add the picks to the served list.
 * - Otherwise take every unseen key, top up at random from the served ones, and reset the
 *   served list to just the keys served now, so the cycle starts again.
 */
export function pickFresh<K extends number | string>(
  keys: readonly K[],
  served: readonly unknown[],
  n: number,
  rand: RandomInt = secureRandomInt,
): { picked: K[]; served: K[] } {
  if (n > keys.length) throw new Error(`cannot pick ${n} of ${keys.length} keys`);
  const pool = new Set<unknown>(keys);
  const servedSet = new Set<K>(served.filter((k): k is K => pool.has(k)));
  const unseen = keys.filter((k) => !servedSet.has(k));

  if (unseen.length >= n) {
    const picked = shuffle(unseen, rand).slice(0, n);
    return { picked, served: [...servedSet, ...picked] };
  }

  const reused = shuffle(keys.filter((k) => servedSet.has(k)), rand).slice(0, n - unseen.length);
  const picked = shuffle([...unseen, ...reused], rand);
  return { picked, served: picked };
}
