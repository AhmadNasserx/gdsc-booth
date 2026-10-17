import type { Tab } from './types';

/**
 * Seconds allowed per game before the speed bonus reaches zero. Server-side only:
 * the client never needs these numbers, so they are not part of any response.
 */
export const GAME_TIME_LIMIT: Record<Tab, number> = {
  riddles: 90,
  bugs: 120,
  memory: 90,
};

const BASE_POINTS = 1000;
const SPEED_POINTS = 250;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Performance in [0, 1] from a value that may be out of range or not finite. */
function unit(p: number): number {
  return Number.isFinite(p) ? clamp(p, 0, 1) : 0;
}

/**
 * Score for one finished run.
 *   score = round(1000 * P) + round(250 * P * max(0, 1 - durationSec / T[game]))
 * P = 0 gives no points at all. An instant finish gets the full speed bonus (250 * P).
 * A run that takes T seconds or longer gets no speed bonus.
 */
export function calcRunScore(game: Tab, performance: number, durationMs: number): number {
  const p = unit(performance);
  // An unknown duration earns no speed bonus.
  const speed = Number.isFinite(durationMs)
    ? Math.max(0, 1 - Math.max(0, durationMs) / 1000 / GAME_TIME_LIMIT[game])
    : 0;
  return Math.round(BASE_POINTS * p) + Math.round(SPEED_POINTS * p * speed);
}

/** Memory performance: 8 moves (every pair found first time) is full marks, 32 moves or more is zero. */
export function memoryPerformance(moves: number): number {
  return unit((32 - moves) / 24);
}
