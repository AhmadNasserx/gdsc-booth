import { RIDDLE_POOL } from '../questions';
import type { ReviewItem, RiddleView } from '../apiTypes';
import { listOf, pickIndices, readAnswers, RunError, secureRandomInt, shuffle, type BatchReply, type RandomInt, type Step } from './shared';

export const RIDDLE_COUNT = 5;

export interface RiddleState {
  /** Indices into RIDDLE_POOL, in the order they are asked. */
  indices: number[];
}

export function startRiddles(
  picked?: number[],
  rand: RandomInt = secureRandomInt,
): { state: RiddleState; view: { game: 'riddles'; questions: RiddleView[] } } {
  const indices = picked ?? pickIndices(RIDDLE_POOL.length, RIDDLE_COUNT, rand);
  const questions = indices.map((i) => {
    const riddle = RIDDLE_POOL[i];
    return { emojis: riddle.emojis, hint: riddle.hint, options: shuffle(riddle.options, rand) };
  });
  return { state: { indices }, view: { game: 'riddles', questions } };
}

export function hydrateRiddles(raw: Partial<RiddleState> | null | undefined): RiddleState {
  return { indices: listOf<number>(raw?.indices) };
}

/** The whole batch: one option per riddle, or null for a riddle left open. */
export function parseRiddleBatch(body: Record<string, unknown>): Array<string | null> {
  return readAnswers(body, (value): value is string => typeof value === 'string', 'an option text', { exact: RIDDLE_COUNT });
}

/**
 * Grades the whole batch in order. Every riddle gets a review entry, answered or not. An open
 * riddle counts as wrong. Pure.
 */
export function gradeRiddles(state: RiddleState, answers: ReadonlyArray<string | null>): Step<RiddleState, BatchReply> {
  let correct = 0;
  const results: ReviewItem[] = state.indices.map((poolIndex, i) => {
    const riddle = RIDDLE_POOL[poolIndex];
    const given = answers[i] ?? null;
    if (given !== null && !riddle.options.includes(given)) {
      throw new RunError(400, `answers[${i}] is not one of the options`);
    }
    const right = given === riddle.answer;
    if (right) correct++;
    return { answered: given !== null, correct: right, correctAnswer: riddle.answer };
  });
  return { state, response: { results }, performance: correct / RIDDLE_COUNT };
}
