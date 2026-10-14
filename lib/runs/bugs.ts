import { BUG_POOL } from '../questions';
import type { BugView, ReviewItem } from '../apiTypes';
import { listOf, pickIndices, readAnswers, RunError, secureRandomInt, type BatchReply, type RandomInt, type Step } from './shared';

export const BUG_COUNT = 5;

export interface BugState {
  indices: number[];
}

export function startBugs(
  picked?: number[],
  rand: RandomInt = secureRandomInt,
): { state: BugState; view: { game: 'bugs'; questions: BugView[] } } {
  const indices = picked ?? pickIndices(BUG_POOL.length, BUG_COUNT, rand);
  const questions = indices.map((i) => {
    const bug = BUG_POOL[i];
    return { title: bug.title, language: bug.language, lines: [...bug.lines] };
  });
  return { state: { indices }, view: { game: 'bugs', questions } };
}

export function hydrateBugs(raw: Partial<BugState> | null | undefined): BugState {
  return { indices: listOf<number>(raw?.indices) };
}

/** The whole batch: the 0-based buggy line for each snippet, or null for a snippet left open. */
export function parseBugBatch(body: Record<string, unknown>): Array<number | null> {
  return readAnswers(body, (value): value is number => Number.isInteger(value), 'a line index', { exact: BUG_COUNT });
}

/**
 * Grades the whole batch. Every snippet gets a review entry with its explanation, answered or
 * not. An open snippet counts as wrong. Pure.
 */
export function gradeBugs(state: BugState, answers: ReadonlyArray<number | null>): Step<BugState, BatchReply> {
  let correct = 0;
  const results: ReviewItem[] = state.indices.map((poolIndex, i) => {
    const bug = BUG_POOL[poolIndex];
    const given = answers[i] ?? null;
    if (given !== null && (given < 0 || given >= bug.lines.length)) {
      throw new RunError(400, `answers[${i}] is out of range`);
    }
    const right = given === bug.answer;
    if (right) correct++;
    return { answered: given !== null, correct: right, correctAnswer: bug.answer, explanation: bug.explanation };
  });
  return { state, response: { results }, performance: correct / BUG_COUNT };
}
