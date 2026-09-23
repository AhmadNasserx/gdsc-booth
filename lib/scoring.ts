import type { Tab } from './types';

export const VALID_RIDDLE_SCORES = new Set([0, 40, 80, 120, 160, 200]);
export const VALID_BINARY_SCORES = new Set([0, 150]);
export const MAX_TRIVIA_SCORE = 300;
export const MAX_PASSWORD_SCORE = 200;
export const MAX_TOTAL = 850;

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
