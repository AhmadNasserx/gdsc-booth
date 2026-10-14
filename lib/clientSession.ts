// Browser-side session helpers shared by the name entry page and the success screen.
// Every storage access is wrapped in try/catch: localStorage and sessionStorage can be
// blocked, full, or missing (private windows, embedded frames, disabled site data).
// Nothing here runs during render, so server and client markup stay identical.

export const PLAYER_KEY_STORAGE = 'gdscPlayerKey';
export const PLAYER_NAME_STORAGE = 'gdscPlayerName';

const PLAYER_KEY_PATTERN = /^[0-9a-f]{64}$/;
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const STORAGE_ERROR = "Couldn't save your session. Check that your browser allows site storage.";

export type StartSessionResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

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

type SessionStartedListener = () => void;
const sessionStartedListeners = new Set<SessionStartedListener>();

/**
 * Runs `listener` after each successful startSession(). The play page uses this to
 * reset its state when "Play again" starts a new session at the same URL.
 * Returns an unsubscribe function.
 */
export function onSessionStarted(listener: SessionStartedListener): () => void {
  sessionStartedListeners.add(listener);
  return () => {
    sessionStartedListeners.delete(listener);
  };
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
 * On success, stores the session in sessionStorage, drops any game picked in a previous
 * session, and remembers the name. Never throws.
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
  if (typeof body.token !== 'string' || !body.questions) {
    return { ok: false, status: res.status, error: GENERIC_ERROR };
  }

  try {
    // A new session starts with no pick; drop any game chosen in a previous session.
    sessionStorage.removeItem('playerGame');
    sessionStorage.setItem('playerToken', body.token);
    sessionStorage.setItem('playerName', trimmed);
    sessionStorage.setItem('playerQuestions', JSON.stringify(body.questions));
  } catch {
    return { ok: false, status: 0, error: STORAGE_ERROR };
  }

  saveName(trimmed);
  sessionStartedListeners.forEach((listener) => listener());
  return { ok: true };
}
