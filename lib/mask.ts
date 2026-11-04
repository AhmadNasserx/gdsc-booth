import { adminDb } from './firebaseAdmin';

/**
 * The leaderboard mask. While it is on, the public leaderboard shows a "winners coming up" curtain
 * instead of names and scores, so the ceremony can reveal them. The game itself keeps running.
 * Staff turn it on and off in the admin panel or on the /announce page; it is stored at config/masked.
 */
export const MASKED_MESSAGE = 'Winners are being announced. The leaderboard is back right after.';

/** How long a mask flag read from the database is reused before it is read again. */
export const MASK_CACHE_MS = 3000;

let cache: { value: boolean; at: number } | null = null;

/** Whether the public leaderboard is masked right now. Off when nothing is stored or the read fails. */
export async function isMasked(): Promise<boolean> {
  const now = Date.now();
  if (cache && now >= cache.at && now - cache.at < MASK_CACHE_MS) return cache.value;
  let value: boolean;
  try {
    value = (await adminDb.ref('config/masked').get()).val() === true;
  } catch {
    // A failed read is not cached, so the next call tries the database again.
    return false;
  }
  cache = { value, at: now };
  return value;
}

/** Turns the mask on or off and forgets the cached value. */
export async function setMasked(masked: boolean): Promise<void> {
  await adminDb.ref('config/masked').set(masked);
  cache = null;
}

/** Forgets the cached mask flag, so the next isMasked() call reads the database. */
export function clearMaskCache(): void {
  cache = null;
}
