import { randomInt } from 'crypto';
import type { Tab } from '../types';

/** A run cannot be played for longer than this, whatever the session says. */
export const RUN_TTL_MS = 2 * 60 * 60 * 1000;

/** Leaderboard entries live this long after the session that last updated them was issued. */
export const LEADERBOARD_TTL_MS = 48 * 60 * 60 * 1000;

/** Minimum gap between two actions on the same run. Memory flips are quicker than the other games. */
export function minIntervalMs(game: Tab): number {
  return game === 'memory' ? 120 : 300;
}

export type RandomInt = (max: number) => number;

/** Content picks use the OS CSPRNG so a player cannot predict the next word or layout. */
export const secureRandomInt: RandomInt = (max) => randomInt(max);

export function shuffle<T>(items: readonly T[], rand: RandomInt = secureRandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickIndices(poolSize: number, n: number, rand: RandomInt = secureRandomInt): number[] {
  return shuffle(Array.from({ length: poolSize }, (_, i) => i), rand).slice(0, n);
}

export type ErrorStatus = 400 | 404 | 409 | 429;

/** A rejected action. The route turns it into `{ error }` with the given status. */
export class RunError extends Error {
  readonly status: ErrorStatus;

  constructor(status: ErrorStatus, message: string) {
    super(message);
    this.name = 'RunError';
    this.status = status;
  }
}

/**
 * Result of one action on a run. `performance` is only set when the action finishes the run,
 * and it is P in [0, 1] for calcRunScore.
 */
export interface Step<S, R> {
  state: S;
  response: R;
  performance?: number;
}

export type RunStatus = 'active' | 'done' | 'abandoned';

/** Shape of runs/{runId}. The state holds the secret data and never leaves the server. */
export interface RunRecord<S = unknown> {
  sessionId: string;
  game: Tab;
  normKey: string;
  name: string;
  startedAt: number;
  lastActionAt: number;
  status: RunStatus;
  expiresAt: number;
  state: S;
  /** Set when the run finishes. `settled` turns true once the leaderboard has the score. */
  final?: {
    score: number;
    durationMs: number;
    response: Record<string, unknown>;
    settled: boolean;
  };
}

/**
 * RTDB drops undefined and empty arrays/objects, and rejects undefined values on write.
 * Round-tripping through JSON gives a value that is safe to store.
 */
export function toStorable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** RTDB returns arrays as objects when they are sparse, and omits empty ones entirely. */
export function listOf<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value) as T[];
  return [];
}

export function numberOf(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Optional `q` (question index) on sequential answers. Lets a retried request be recognised. */
export function optionalQuestionIndex(body: Record<string, unknown>): number | undefined {
  if (body.q === undefined) return undefined;
  if (!Number.isInteger(body.q) || (body.q as number) < 0) {
    throw new RunError(400, 'Invalid question index');
  }
  return body.q as number;
}

/** Sequential answering: an answer must be for the question that is currently open. */
export function expectQuestion(q: number | undefined, expected: number): void {
  if (q !== undefined && q !== expected) throw new RunError(409, 'Answer is out of order');
}
