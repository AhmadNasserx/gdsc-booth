import type { Tab } from './types';

export const VALID_RIDDLE_SCORES = new Set([0, 25, 50, 75, 100]);
export const VALID_BINARY_SCORES = new Set([0, 100]);
export const MAX_TRIVIA_SCORE = 99;
export const MAX_PASSWORD_SCORE = 100;
export const MAX_TOTAL = 400;

export function validateScores(scores: Record<Tab, number>): boolean {
  const { riddles, trivia, binary, password } = scores;
  if (!VALID_RIDDLE_SCORES.has(riddles)) return false;
  if (!Number.isInteger(trivia) || trivia < 0 || trivia > MAX_TRIVIA_SCORE) return false;
  if (!VALID_BINARY_SCORES.has(binary)) return false;
  if (!Number.isInteger(password) || password < 0 || password > MAX_PASSWORD_SCORE) return false;
  return true;
}

export function calcTotal(scores: Record<Tab, number>): number {
  return scores.riddles + scores.trivia + scores.binary + scores.password;
}

// Matches 3+ repeated chars, common sequences, and dictionary fragments
const WEAK_PATTERN = /(.)\1{2,}|012|123|234|345|456|567|678|789|890|abc|bcd|cde|qwerty|password|admin|letmein/i;

export function calcPasswordScore(pass: string): number {
  if (!pass) return 0;

  // Length: max 35pts, needs 18+ chars to max out (not just 12)
  const lengthScore = pass.length < 8 ? 0 : Math.min(pass.length / 18, 1) * 35;

  // Character variety: max 50pts
  const hasUpper = /[A-Z]/.test(pass) ? 15 : 0;
  const hasDigit = /[0-9]/.test(pass) ? 15 : 0;
  const hasSymbol = /[^A-Za-z0-9]/.test(pass) ? 20 : 0;

  // Uniqueness ratio: max 15pts — penalises repeated chars like "aaaa1A!"
  const uniquenessScore = (new Set(pass).size / pass.length) * 15;

  // Pattern penalty: known weak sequences reduce the score
  const penalty = WEAK_PATTERN.test(pass) ? 15 : 0;

  return Math.max(0, Math.min(100, Math.round(lengthScore + hasUpper + hasDigit + hasSymbol + uniquenessScore - penalty)));
}

export function passwordStrengthLabel(score: number): string {
  if (score >= 86) return 'Excellent 🔥';
  if (score >= 71) return 'Strong 💪';
  if (score >= 51) return 'Good 👍';
  if (score >= 31) return 'Fair 😐';
  return 'Weak 😬';
}
