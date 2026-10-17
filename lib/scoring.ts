import type { Tab } from './types';

/**
 * Seconds allowed per game before the speed bonus reaches zero. Server-side only:
 * the client never needs these numbers, so they are not part of any response.
 */
export const GAME_TIME_LIMIT: Record<Tab, number> = {
  riddles: 90,
  trivia: 240,
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

/** Trivia points evolve one answer at a time: +20 for a right answer, -10 for a wrong one, never below 0. */
export const TRIVIA_CORRECT_POINTS = 20;
export const TRIVIA_WRONG_PENALTY = 10;
const TRIVIA_POINTS_CAP = 300;

export function triviaStep(points: number, correct: boolean): number {
  return Math.max(0, points + (correct ? TRIVIA_CORRECT_POINTS : -TRIVIA_WRONG_PENALTY));
}

/** Trivia performance from the running points total. */
export function triviaPerformance(points: number): number {
  return unit(clamp(points, 0, TRIVIA_POINTS_CAP) / TRIVIA_POINTS_CAP);
}

/** Memory performance: 8 moves (every pair found first time) is full marks, 32 moves or more is zero. */
export function memoryPerformance(moves: number): number {
  return unit((32 - moves) / 24);
}
