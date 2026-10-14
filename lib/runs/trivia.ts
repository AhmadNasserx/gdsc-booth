import { TRIVIA_POOL } from '../questions';
import type { ReviewItem, TriviaView } from '../apiTypes';
import { triviaPerformance, triviaStep } from '../scoring';
import { listOf, pickIndices, readAnswers, RunError, secureRandomInt, shuffle, type BatchReply, type RandomInt, type Step } from './shared';

export const TRIVIA_COUNT = 15;

export interface TriviaState {
  indices: number[];
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
  return { state: { indices }, view: { game: 'trivia', questions } };
}

export function hydrateTrivia(raw: Partial<TriviaState> | null | undefined): TriviaState {
  return { indices: listOf<number>(raw?.indices) };
}

/** The batch: up to one entry per question, in order. Questions after the last entry are open. */
export function parseTriviaBatch(body: Record<string, unknown>): Array<string | null> {
  return readAnswers(body, (value): value is string => typeof value === 'string', 'an option text', { max: TRIVIA_COUNT });
}

/**
 * Grades the batch in order. Points run +20 for a right answer and -10 for a wrong one, never
 * below 0, applied one question at a time. A skipped question (null or missing) leaves the points
 * as they are. Every question gets a review entry. Pure.
 */
export function gradeTrivia(state: TriviaState, answers: ReadonlyArray<string | null>): Step<TriviaState, BatchReply> {
  let points = 0;
  const results: ReviewItem[] = [];
  state.indices.forEach((poolIndex, i) => {
    const question = TRIVIA_POOL[poolIndex];
    const given = answers[i] ?? null;
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
