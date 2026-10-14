import type { Tab } from './types';
import { GAMES } from './games';

export const LEADERBOARD_MAX = 1000;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Converts a game's raw points into the shared 0..LEADERBOARD_MAX scale. */
export function normalizeScore(game: Tab, raw: number): number {
  const { maxRaw } = GAMES[game];
  const safe = Number.isFinite(raw) ? raw : 0;
  return Math.round((clamp(safe, 0, maxRaw) / maxRaw) * LEADERBOARD_MAX);
}

export function calcWordleScore(guesses: number, solved: boolean): number {
  if (!solved) return 0;
  const table = [300, 250, 200, 150, 100, 50];
  return table[Math.min(guesses - 1, 5)] ?? 0;
}

/** Memory Match raw score: 1000 at 8 moves within 20 seconds, minus penalties. */
export function calcMemoryScore(moves: number, seconds: number): number {
  const raw = 1000 - (moves - 8) * 25 - Math.max(0, seconds - 20) * 5;
  return Math.round(clamp(raw, 0, LEADERBOARD_MAX));
}

/** Rejects memory results that cannot be produced by a real game (8 pairs, sane timing). */
export function isPlausibleMemory(moves: unknown, seconds: unknown): boolean {
  return (
    Number.isInteger(moves) && (moves as number) >= 8 && (moves as number) <= 200 &&
    Number.isInteger(seconds) && (seconds as number) >= 6 && (seconds as number) <= 3600
  );
}

// Matches 3+ repeated chars, common sequences, and dictionary fragments
const WEAK_PATTERN = /(.)\1{2,}|012|123|234|345|456|567|678|789|890|abc|bcd|cde|qwerty|password|admin|letmein/i;

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

  return Math.max(0, Math.min(200, Math.round(lengthScore + hasUpper + hasDigit + hasSymbol + uniquenessScore - penalty)));
}

export function passwordStrengthLabel(score: number): string {
  if (score >= 172) return 'Excellent 🔥';
  if (score >= 142) return 'Strong 💪';
  if (score >= 102) return 'Good 👍';
  if (score >= 62) return 'Fair 😐';
  return 'Weak 😬';
}
