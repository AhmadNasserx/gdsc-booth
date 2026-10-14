import { createHash } from 'crypto';

/** Display names: 2-30 letters (including Latin accents), digits and spaces. */
export const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;

const PLAYER_KEY_PATTERN = /^[0-9a-f]{64}$/;

/** Lowercase, spaces to underscores, everything except a-z, 0-9 and _ removed. Used as the names/leaderboard key. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/** Stored instead of the raw player key so the key itself never reaches the database. */
export function hashPlayerKey(playerKey: string): string {
  return createHash('sha256').update(playerKey).digest('hex');
}

/** A player key is 32 random bytes encoded as 64 lowercase hex characters. */
export function isValidPlayerKey(playerKey: unknown): playerKey is string {
  return typeof playerKey === 'string' && PLAYER_KEY_PATTERN.test(playerKey);
}
