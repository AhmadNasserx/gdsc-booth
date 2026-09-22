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

export function calcPasswordScore(pass: string): number {
  let score = 0;
  if (pass.length >= 8) score += 25;
  if (pass.length >= 12) score += 25;
  if (/[A-Z]/.test(pass)) score += 15;
  if (/[0-9]/.test(pass)) score += 15;
  if (/[^A-Za-z0-9]/.test(pass)) score += 20;
  return Math.min(score, 100);
}
