// Browser-side session helpers shared by the name entry page and the game pages.
// Every storage access is wrapped in try/catch: localStorage and sessionStorage can be
// blocked, full, or missing (private windows, embedded frames, disabled site data).
// Nothing here runs during render, so server and client markup stay identical.

export const PLAYER_KEY_STORAGE = 'gdscPlayerKey';
export const PLAYER_NAME_STORAGE = 'gdscPlayerName';

// sessionStorage keys for the current game session.
const TOKEN_KEY = 'playerToken';
const SESSION_NAME_KEY = 'playerName';
const LEGACY_SESSION_KEYS = ['playerQuestions', 'playerGame'];
// One-off message for the home page (for example "your session expired").
export const SESSION_NOTICE_KEY = 'sessionNotice';

const PLAYER_KEY_PATTERN = /^[0-9a-f]{64}$/;
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const STORAGE_ERROR = "Couldn't save your session. Check that your browser allows site storage.";

export type StartSessionResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export interface PlayerSession {
  token: string;
  name: string;
}

// Used only when localStorage is unavailable: the key then lasts for this page load.
let memoryKey: string | null = null;

function newPlayerKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns this browser's player key, creating and persisting it on first use.
 * The key proves a display name belongs to this browser; the server keeps only its hash.
 */
export function getPlayerKey(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(PLAYER_KEY_STORAGE);
  } catch {
    // Storage blocked: fall through to the in-memory key.
  }
  if (stored && PLAYER_KEY_PATTERN.test(stored)) {
    memoryKey = stored;
    return stored;
  }

  memoryKey ??= newPlayerKey();
  try {
    localStorage.setItem(PLAYER_KEY_STORAGE, memoryKey);
  } catch {
    // Not persisted; the in-memory key still works for this page load.
  }
  return memoryKey;
}

/** The display name used last time in this browser, or null. */
export function getSavedName(): string | null {
  try {
    return localStorage.getItem(PLAYER_NAME_STORAGE);
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE, name);
  } catch {
    // Name is only a convenience for the next visit; ignore storage failures.
  }
}

/** The current session's token and name, or null when there is no complete session. */
export function getSession(): PlayerSession | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const name = sessionStorage.getItem(SESSION_NAME_KEY);
    return token && name ? { token, name } : null;
  } catch {
    return null;
  }
}

/** Forgets the current game session. The saved name stays, so the name entry page can prefill it. */
export function clearSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_NAME_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** Leaves a message for the home page to show once. */
export function setSessionNotice(message: string): void {
  try {
    sessionStorage.setItem(SESSION_NOTICE_KEY, message);
  } catch {
    // The player still lands on the home page; only the explanation is lost.
  }
}

/** Returns the pending home page notice and removes it, so it shows only once. */
export function takeSessionNotice(): string | null {
  try {
    const message = sessionStorage.getItem(SESSION_NOTICE_KEY);
    sessionStorage.removeItem(SESSION_NOTICE_KEY);
    return message;
  } catch {
    return null;
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Creates a new game session for `name` (POST /api/session) with this browser's player key.
 * On success, stores only the token and name in sessionStorage and remembers the name.
 * Never throws.
 */
export async function startSession(name: string): Promise<StartSessionResult> {
  const trimmed = name.trim();

  let res: Response;
  let data: unknown;
  try {
    res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, playerKey: getPlayerKey() }),
    });
    data = await readJson(res);
  } catch {
    return { ok: false, status: 0, error: GENERIC_ERROR };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof body.error === 'string' ? body.error : GENERIC_ERROR,
    };
  }
  if (typeof body.token !== 'string') {
    return { ok: false, status: res.status, error: GENERIC_ERROR };
  }

  try {
    // Drop keys left by the previous game flow, which stored questions and a picked game.
    LEGACY_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.setItem(TOKEN_KEY, body.token);
    sessionStorage.setItem(SESSION_NAME_KEY, trimmed);
  } catch {
    return { ok: false, status: 0, error: STORAGE_ERROR };
  }

  saveName(trimmed);
  return { ok: true };
}
