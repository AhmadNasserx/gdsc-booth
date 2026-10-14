// Browser-side wrappers for the game API routes. Each call throws a GameApiError whose
// message is safe to show the player. `status` lets callers tell an expired session (401)
// from a failure that a retry might fix.

import type { ActionBody, MeResponse, StartResponse } from '@/lib/apiTypes';
import type { Tab } from '@/lib/types';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

export class GameApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GameApiError';
    this.status = status;
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GameApiError(0, NETWORK_ERROR);
  }

  const data = await readJson(res);
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : GENERIC_ERROR;
    throw new GameApiError(res.status, message);
  }
  if (!data || typeof data !== 'object') {
    throw new GameApiError(res.status, GENERIC_ERROR);
  }
  return data as T;
}

/** Starts a fresh run of `game` (POST /api/game/start). The response carries no answers. */
export function startGame(token: string, game: Tab): Promise<StartResponse> {
  return post<StartResponse>('/api/game/start', { token, game });
}

/** Sends one player action for a run (POST /api/game/action). R is the matching response type. */
export function sendAction<R>(token: string, runId: string, body: ActionBody): Promise<R> {
  return post<R>('/api/game/action', { token, runId, ...body });
}

/** The player's name, total, rank and per-game bests (POST /api/me). */
export function fetchMe(token: string): Promise<MeResponse> {
  return post<MeResponse>('/api/me', { token });
}
