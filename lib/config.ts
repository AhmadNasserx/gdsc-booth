import { adminDb } from './firebaseAdmin';

/**
 * Fallback used when no boolean config/paused flag is stored in the database. The admin panel
 * sets that flag, and it wins over this value. While the game is paused no new names, no new
 * games and no more answers are accepted, and the home page says so. The leaderboard keeps working.
 */
export const GAME_PAUSED = false;

export const PAUSED_MESSAGE = 'The game is paused right now. The leaderboard is still live.';

/** How long a pause flag read from the database is reused before it is read again. */
export const PAUSE_CACHE_MS = 3000;

let cache: { value: boolean; at: number } | null = null;

/** Whether the game is paused right now. Reads config/paused, falling back to GAME_PAUSED. */
export async function isPaused(): Promise<boolean> {
  const now = Date.now();
  if (cache && now >= cache.at && now - cache.at < PAUSE_CACHE_MS) return cache.value;

  let value: boolean;
  try {
    const snap = await adminDb.ref('config/paused').get();
    const stored = snap.val();
    value = typeof stored === 'boolean' ? stored : GAME_PAUSED;
  } catch {
    // A failed read is not cached, so the next call tries the database again.
    return GAME_PAUSED;
  }

  cache = { value, at: now };
  return value;
}

/** Forgets the cached pause flag, so the next isPaused() call reads the database. */
export function clearPauseCache(): void {
  cache = null;
}
