import type { Tab } from './types';

/**
 * Seconds allowed per game before the speed bonus reaches zero. Server-side only:
 * the client never needs these numbers, so they are not part of any response.
 */
export const GAME_TIME_LIMIT: Record<Tab, number> = {
  riddles: 90,
  trivia: 240,
  bugs: 120,
  wordle: 180,
  memory: 90,
  password: 90,
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

const WORDLE_POINTS = [300, 250, 200, 150, 100, 50];
const WORDLE_CAP = 300;

/** Wordle points: fewer guesses, more points. Zero when the word was not found. */
export function calcWordleScore(guesses: number, solved: boolean): number {
  if (!solved) return 0;
  return WORDLE_POINTS[Math.min(guesses - 1, WORDLE_POINTS.length - 1)] ?? 0;
}

/** Wordle performance from the guess count. */
export function wordlePerformance(guesses: number, solved: boolean): number {
  return unit(calcWordleScore(guesses, solved) / WORDLE_CAP);
}

// Matches 3+ repeated chars, common sequences, and dictionary fragments
const WEAK_PATTERN = /(.)\1{2,}|012|123|234|345|456|567|678|789|890|abc|bcd|cde|qwerty|password|admin|letmein/i;

const PASSWORD_CAP = 200;

export function calcPasswordScore(pass: string): number {
  if (!pass) return 0;

  // Length: max 70pts, needs 24+ chars to max out
  const lengthScore = pass.length < 8 ? 0 : Math.min(pass.length / 24, 1) * 70;

  // Character variety: max 100pts
  const hasUpper = /[A-Z]/.test(pass) ? 30 : 0;
  const hasDigit = /[0-9]/.test(pass) ? 30 : 0;
  const hasSymbol = /[^A-Za-z0-9]/.test(pass) ? 40 : 0;

  // Uniqueness ratio: max 30pts — penalises repeated chars like "aaaa1A!"
  const uniquenessScore = (new Set(pass).size / pass.length) * 30;

  // Pattern penalty: known weak sequences reduce the score
  const penalty = WEAK_PATTERN.test(pass) ? 30 : 0;

  return Math.max(0, Math.min(PASSWORD_CAP, Math.round(lengthScore + hasUpper + hasDigit + hasSymbol + uniquenessScore - penalty)));
}

/** Password performance from the strength points. */
export function passwordPerformance(pass: string): number {
  return unit(calcPasswordScore(pass) / PASSWORD_CAP);
}

export function passwordStrengthLabel(score: number): string {
  if (score >= 172) return 'Excellent 🔥';
  if (score >= 142) return 'Strong 💪';
  if (score >= 102) return 'Good 👍';
  if (score >= 62) return 'Fair 😐';
  return 'Weak 😬';
}
