import type { CheckBody, CheckResponse } from '@/lib/apiTypes';

/** Checks one answer with the server. Resolves with the reply for that question. */
export type CheckFn = (body: CheckBody) => Promise<CheckResponse>;

/** What the player sees once the server has graded a pick. */
export interface Verdict {
  option: string;
  correct: boolean;
  correctAnswer: string;
}

/**
 * How long a pick may wait for its verdict. Past this the game moves on with the neutral look,
 * and a late reply is ignored.
 */
export const VERDICT_WAIT_MS = 1200;

/**
 * Runs `task` once the calls queued before it have settled. Checks go out one at a time, so the
 * server records the questions in the order they were answered, even when a reply is slow.
 */
export function runInOrder<T>(queue: { current: Promise<unknown> }, task: () => Promise<T>): Promise<T> {
  const reply = queue.current.then(task);
  queue.current = reply.catch(() => undefined);
  return reply;
}

/** Accepts a check reply only when it has the fields a verdict needs. */
export function isVerdictReply(reply: unknown): reply is CheckResponse {
  if (!reply || typeof reply !== 'object') return false;
  const { correct, correctAnswer } = reply as Partial<CheckResponse>;
  return typeof correct === 'boolean' && typeof correctAnswer === 'string';
}

/** A run of this many right answers in a row earns the streak cue and the pill. */
export const STREAK_MIN = 3;

/**
 * The streak after one verdict. It only moves on a verdict, so a question with no verdict (a slow
 * or failed check) leaves the streak alone.
 */
export function nextStreak(streak: number, correct: boolean): number {
  return correct ? streak + 1 : 0;
}
