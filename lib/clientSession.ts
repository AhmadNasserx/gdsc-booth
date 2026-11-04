// Browser-side session helpers shared by the name entry page and the game pages.
// Every storage access is wrapped in try/catch: localStorage and sessionStorage can be
// blocked, full, or missing (private windows, embedded frames, disabled site data).
// Storage is only read during render on the client (see useIsBrowser), so server and
// client markup stay identical.
import { useSyncExternalStore } from 'react';
import { findCountry } from './countries';

export const PLAYER_KEY_STORAGE = 'gdscPlayerKey';
export const PLAYER_NAME_STORAGE = 'gdscPlayerName';
// The country and national number typed on the name entry page, as JSON. An older version stored the
// raw number under LEGACY_PHONE_STORAGE; that value is ignored and removed when a new one is saved.
export const PLAYER_PHONE_STORAGE = 'gdscPlayerCountryPhone';
const LEGACY_PHONE_STORAGE = 'gdscPlayerPhone';

// sessionStorage keys for the current game session.
const TOKEN_KEY = 'playerToken';
const SESSION_NAME_KEY = 'playerName';
const LEGACY_SESSION_KEYS = ['playerQuestions', 'playerGame'];
// One-off message for the home page (for example "your session expired").
export const SESSION_NOTICE_KEY = 'sessionNotice';

const PLAYER_KEY_PATTERN = /^[0-9a-f]{64}$/;
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const STORAGE_ERROR = "Couldn't save your session. Check that your browser allows site storage.";

/** The form field a failed start refers to, when the server says which one. */
export type StartSessionField = 'name' | 'phone' | 'consent' | 'school' | 'grade' | 'lang';

export type StartSessionResult =
  | { ok: true }
  | { ok: false; status: number; error: string; field?: StartSessionField };

export interface PlayerSession {
  token: string;
  name: string;
}

/** The phone fields as the player typed them: a country code from the picker and the digits after it. */
export interface SavedPhone {
  country: string;
  national: string;
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

/** The country and national number used last time in this browser, or null. Consent is never remembered. */
export function getSavedPhone(): SavedPhone | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PLAYER_PHONE_STORAGE) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const { country, national } = parsed as Record<string, unknown>;
    if (typeof country !== 'string' || typeof national !== 'string') return null;
    // A country code that is no longer in the list is treated as nothing saved.
    if (!findCountry(country)) return null;
    return { country, national };
  } catch {
    return null;
  }
}

export function savePhone(phone: SavedPhone): void {
  try {
    localStorage.setItem(PLAYER_PHONE_STORAGE, JSON.stringify(phone));
    localStorage.removeItem(LEGACY_PHONE_STORAGE);
  } catch {
    // Phone is only a convenience for the next visit; ignore storage failures.
  }
}

/** The school and class typed on the home page, remembered for the next visit like the name. */
export interface SavedProfile {
  school: string;
  /** True when the school was typed because it is not in the list. */
  other: boolean;
  grade: string;
  track: string;
}

export const PLAYER_PROFILE_STORAGE = 'bauPlayerProfile';

/** The school and class used last time in this browser, or null. */
export function getSavedProfile(): SavedProfile | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PLAYER_PROFILE_STORAGE) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const { school, other, grade, track } = parsed as Record<string, unknown>;
    if (typeof school !== 'string' || typeof grade !== 'string' || typeof track !== 'string') return null;
    return { school, other: other === true, grade, track };
  } catch {
    return null;
  }
}

export function saveProfile(profile: SavedProfile): void {
  try {
    localStorage.setItem(PLAYER_PROFILE_STORAGE, JSON.stringify(profile));
  } catch {
    // Only a convenience for the next visit; ignore storage failures.
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

/** The pending home page notice, without removing it. */
export function peekSessionNotice(): string | null {
  try {
    return sessionStorage.getItem(SESSION_NOTICE_KEY);
  } catch {
    return null;
  }
}

/** Removes the pending home page notice, so it shows only once. */
export function clearSessionNotice(): void {
  try {
    sessionStorage.removeItem(SESSION_NOTICE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

const noopSubscribe = () => () => {};

/**
 * False on the server and during hydration, true once the page runs in the browser.
 * Components use it to read storage without a hydration mismatch and without setState in an effect.
 */
export function useIsBrowser(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const FIELDS: readonly StartSessionField[] = ['name', 'phone', 'consent', 'school', 'grade', 'lang'];

/**
 * Creates a new game session (POST /api/session) with this browser's player key.
 * `phone` is the full international number (for example "+96170123456"), checked and normalised by the server.
 * `consent` must be true. `profile` carries the school, class and language picked on the home page.
 * On success, stores only the token and name in sessionStorage and remembers the name. The page remembers
 * the phone, since it knows the country and the digits typed. Never throws.
 */
export async function startSession(
  name: string,
  phone: string,
  consent: boolean,
  profile?: Record<string, unknown>,
): Promise<StartSessionResult> {
  const trimmed = name.trim();
  const trimmedPhone = phone.trim();

  let res: Response;
  let data: unknown;
  try {
    res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, phone: trimmedPhone, consent, playerKey: getPlayerKey(), ...profile }),
    });
    data = await readJson(res);
  } catch {
    return { ok: false, status: 0, error: GENERIC_ERROR };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  if (!res.ok) {
    const field = FIELDS.find((f) => f === body.field);
    return {
      ok: false,
      status: res.status,
      error: typeof body.error === 'string' ? body.error : GENERIC_ERROR,
      ...(field ? { field } : {}),
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
