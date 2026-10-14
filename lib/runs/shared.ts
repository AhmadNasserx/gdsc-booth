import { randomInt } from 'crypto';
import type { ReviewItem } from '../apiTypes';
import type { Tab } from '../types';

/** A run cannot be played for longer than this, whatever the session says. */
export const RUN_TTL_MS = 2 * 60 * 60 * 1000;

/** Leaderboard entries live this long after the session that last updated them was issued. */
export const LEADERBOARD_TTL_MS = 48 * 60 * 60 * 1000;

/** Minimum gap between two actions on the same run. Memory flips are quicker than the other games. */
export function minIntervalMs(game: Tab): number {
  return game === 'memory' ? 120 : 300;
}

/**
 * A batch cannot be submitted faster than this per answered question. A person needs about this
 * long to read and answer a question, so a faster batch was not really played.
 */
export const BATCH_MS_PER_ANSWER = 500;

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
  /**
   * Set when the run finishes. `response` is the reply to the finishing action (without `done` and
   * `result`) until the run is settled. Once settled it holds the full reply, which is returned as
   * is when a batch is retried. `settled` turns true once the leaderboard has the score.
   */
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

/** One entry per question of a batch: the chosen value, or null when the question was left open. */
export interface BatchAction<T> {
  answers: Array<T | null>;
}

/** Reply to a batch before the run's result is known: the review for every question. */
export type BatchReply = { results: ReviewItem[] };

/**
 * Reads `answers` from a batch body. Each entry is null or a value that `accepts` allows.
 * `size.exact` for a fixed question count, `size.max` when the player may leave questions out.
 * Throws RunError(400) on any other shape.
 */
export function readAnswers<T extends string | number>(
  body: Record<string, unknown>,
  accepts: (value: unknown) => value is T,
  describe: string,
  size: { exact: number } | { max: number },
): Array<T | null> {
  const answers: unknown = body.answers;
  if (!Array.isArray(answers)) throw new RunError(400, 'answers must be an array');
  if ('exact' in size) {
    if (answers.length !== size.exact) throw new RunError(400, `answers must have exactly ${size.exact} entries`);
  } else if (answers.length > size.max) {
    throw new RunError(400, `answers must have at most ${size.max} entries`);
  }
  return answers.map((value: unknown, i: number): T | null => {
    if (value === null) return null;
    if (!accepts(value)) throw new RunError(400, `answers[${i}] must be null or ${describe}`);
    return value;
  });
}

/** How many questions of a batch were answered (nulls are not answers). */
export function answeredOf(answers: ReadonlyArray<unknown>): number {
  return answers.filter((value) => value !== null).length;
}
