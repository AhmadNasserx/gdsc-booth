import type { EventInfo } from '@/lib/apiTypes';

export type { EventInfo };

export const GAME_KEYS = ['riddles', 'memory', 'trivia'] as const;
export type GameKey = (typeof GAME_KEYS)[number];

export const GAME_LABELS: Record<GameKey, string> = {
  riddles: 'Riddles',
  memory: 'Memory',
  trivia: 'Trivia',
};

export const MAX_SCORE = 5000;

export interface GameScores {
  riddles?: number;
  memory?: number;
  trivia?: number;
}

export interface AuditEntry {
  at: number;
  action: string;
  target: string;
}

export interface OverviewResponse {
  event: EventInfo;
  paused: boolean;
  audit: AuditEntry[];
}

export interface WinnerRow {
  rank: number;
  name: string;
  normKey: string;
  score: number;
  phone: string | null;
  prizeGiven: boolean;
  prizeGivenAt: number | null;
}

export interface WinnerRound {
  round: number;
  start: number;
  end: number;
  current: boolean;
  winners: WinnerRow[];
}

export interface WinnersResponse {
  startedAt: number | null;
  rounds: WinnerRound[];
}

export interface AdminPlayer {
  key: string;
  name: string;
  score: number;
  games: GameScores;
  gamesPlayed: number;
  finished: boolean;
  finishedAt: number | null;
  finishedRound: number | null;
  timestamp: number;
}

export interface PlayersResponse {
  players: AdminPlayer[];
}

/** Shared class strings, so every admin control matches the public pages. */
export const CARD = 'rounded-3xl border border-[#DADCE0] bg-white p-5 shadow-sm md:p-6';
export const BUTTON_BASE =
  'inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-[#1A73E8] text-white hover:bg-[#1557B0]`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-[#DADCE0] bg-white text-[#202124] hover:bg-[#F8F9FA]`;
export const BUTTON_DANGER = `${BUTTON_BASE} bg-[#C5221F] text-white hover:bg-[#A50E0E]`;
export const BUTTON_WARNING = `${BUTTON_BASE} bg-[#B06000] text-white hover:bg-[#8A4A00]`;
export const INPUT =
  'w-full min-h-[44px] rounded-2xl border border-[#DADCE0] bg-white p-3 text-base text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#1A73E8]';
export const ERROR_TEXT = 'text-sm font-semibold text-[#EA4335]';
export const SUBTLE_TEXT = 'text-sm text-[#5F6368]';

export const NETWORK_ERROR = 'Could not reach the server. Try again.';
const DEFAULT_ERROR = 'Something went wrong. Try again.';

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; retryAfter: number | null };

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Retry-After in seconds, when the server sent a plain number. */
function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

/**
 * Calls an admin or public API route. Never throws: a network failure comes back as ok: false
 * with status 0. The response body's `error` text is used when there is one.
 */
export async function callApi<T>(
  url: string,
  options: CallOptions = {},
  fallbackError: string = DEFAULT_ERROR,
): Promise<ApiResult<T>> {
  const init: RequestInit = { method: options.method ?? 'GET', cache: 'no-store' };
  if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR, retryAfter: null };
  }

  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };

  const error =
    isRecord(body) && typeof body.error === 'string' && body.error.trim() !== ''
      ? body.error
      : fallbackError;
  return {
    ok: false,
    status: res.status,
    error,
    retryAfter: parseRetryAfter(res.headers.get('Retry-After')),
  };
}

/** True when the session is missing or has expired, so the caller should go to the sign-in page. */
export function isUnauthorized<T>(result: ApiResult<T>): boolean {
  return !result.ok && result.status === 401;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local date and time, for example "4 Nov 2026, 14:05". */
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Local clock time in 24-hour form, for example 14:05. */
export function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Countdown as MM:SS. Whole seconds only; a negative or missing time reads as 00:00. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

/** Copy of a record without one key. */
export function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}
