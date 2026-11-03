import { RIDDLE_POOL } from '../questions';
import type { CheckResponse, ReviewItem, RiddleView } from '../apiTypes';
import {
  givenOf,
  listOf,
  lockAnswer,
  mergeAnswers,
  pickIndices,
  readAnswers,
  readCheck,
  RunError,
  secureRandomInt,
  shuffle,
  type BatchReply,
  type RandomInt,
  type Step,
} from './shared';

export const RIDDLE_COUNT = 5;

export interface RiddleState {
  /** Indices into RIDDLE_POOL, in the order they are asked. */
  indices: number[];
  /** The answer locked in for each question so far, in question order. */
  given: string[];
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
  return { state: { indices, given: [] }, view: { game: 'riddles', questions } };
}

export function hydrateRiddles(raw: Partial<RiddleState> | null | undefined): RiddleState {
  const indices = listOf<number>(raw?.indices);
  return { indices, given: givenOf(raw?.given).slice(0, indices.length) };
}

/** The whole batch: one option per riddle, or null for a riddle left open. */
export function parseRiddleBatch(body: Record<string, unknown>): Array<string | null> {
  return readAnswers(body, (value): value is string => typeof value === 'string', 'an option text', { exact: RIDDLE_COUNT });
}

/**
 * Locks in one answer while the run is being played and says whether it was right. Only the
 * riddle that was answered is revealed. The run is not finished and nothing is scored. Pure.
 */
export function checkRiddle(state: RiddleState, body: Record<string, unknown>): Step<RiddleState, CheckResponse> {
  const check = readCheck(body, state.indices.length);
  const riddle = RIDDLE_POOL[state.indices[check.index]];
  const { given, locked } = lockAnswer(state.given, check, riddle.options);
  return {
    state: { ...state, given },
    response: { index: check.index, correct: locked === riddle.answer, correctAnswer: riddle.answer },
  };
}

/**
 * Grades the whole batch in order. An answer locked in by a check wins over the batch's value for
 * that riddle. Every riddle gets a review entry, answered or not. An open riddle counts as wrong.
 * Pure.
 */
export function gradeRiddles(state: RiddleState, answers: ReadonlyArray<string | null>): Step<RiddleState, BatchReply> {
  const picks = mergeAnswers(state.given, answers, state.indices.length);
  let correct = 0;
  const results: ReviewItem[] = state.indices.map((poolIndex, i) => {
    const riddle = RIDDLE_POOL[poolIndex];
    const given = picks[i];
    if (given !== null && !riddle.options.includes(given)) {
      throw new RunError(400, `answers[${i}] is not one of the options`);
    }
    const right = given === riddle.answer;
    if (right) correct++;
    return { answered: given !== null, correct: right, correctAnswer: riddle.answer };
  });
  return { state, response: { results }, performance: correct / RIDDLE_COUNT };
}
