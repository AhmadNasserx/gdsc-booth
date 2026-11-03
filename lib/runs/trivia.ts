import { TRIVIA_POOL } from '../questions';
import type { CheckResponse, ReviewItem, TriviaView } from '../apiTypes';
import { triviaPerformance, triviaStep } from '../scoring';
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

export const TRIVIA_COUNT = 15;

export interface TriviaState {
  /** Indices into TRIVIA_POOL, in the order they are asked. */
  indices: number[];
  /** The answer locked in for each question so far, in question order. */
  given: string[];
}

export function startTrivia(
  picked?: number[],
  rand: RandomInt = secureRandomInt,
): { state: TriviaState; view: { game: 'trivia'; questions: TriviaView[] } } {
  const indices = picked ?? pickIndices(TRIVIA_POOL.length, TRIVIA_COUNT, rand);
  const questions = indices.map((i) => {
    const q = TRIVIA_POOL[i];
    return { question: q.question, options: shuffle(q.options, rand) };
  });
  return { state: { indices, given: [] }, view: { game: 'trivia', questions } };
}

export function hydrateTrivia(raw: Partial<TriviaState> | null | undefined): TriviaState {
  const indices = listOf<number>(raw?.indices);
  return { indices, given: givenOf(raw?.given).slice(0, indices.length) };
}

/** The batch: up to one entry per question, in order. Questions after the last entry are open. */
export function parseTriviaBatch(body: Record<string, unknown>): Array<string | null> {
  return readAnswers(body, (value): value is string => typeof value === 'string', 'an option text', { max: TRIVIA_COUNT });
}

/**
 * Locks in one answer while the round is being played and says whether it was right. Only the
 * question that was answered is revealed. The run is not finished and no points are counted yet. Pure.
 */
export function checkTrivia(state: TriviaState, body: Record<string, unknown>): Step<TriviaState, CheckResponse> {
  const check = readCheck(body, state.indices.length);
  const question = TRIVIA_POOL[state.indices[check.index]];
  const { given, locked } = lockAnswer(state.given, check, question.options);
  return {
    state: { ...state, given },
    response: { index: check.index, correct: locked === question.answer, correctAnswer: question.answer },
  };
}

/**
 * Grades the batch in order. An answer locked in by a check wins over the batch's value for that
 * question. Points run +20 for a right answer and -10 for a wrong one, never below 0, applied one
 * question at a time. A skipped question (null or missing) leaves the points as they are. Every
 * question gets a review entry. Pure.
 */
export function gradeTrivia(state: TriviaState, answers: ReadonlyArray<string | null>): Step<TriviaState, BatchReply> {
  const picks = mergeAnswers(state.given, answers, state.indices.length);
  let points = 0;
  const results: ReviewItem[] = [];
  state.indices.forEach((poolIndex, i) => {
    const question = TRIVIA_POOL[poolIndex];
    const given = picks[i];
    if (given === null) {
      results.push({ answered: false, correct: false, correctAnswer: question.answer });
      return;
    }
    if (!question.options.includes(given)) throw new RunError(400, `answers[${i}] is not one of the options`);
    const right = given === question.answer;
    points = triviaStep(points, right);
    results.push({ answered: true, correct: right, correctAnswer: question.answer });
  });
  return { state, response: { results }, performance: triviaPerformance(points) };
}
