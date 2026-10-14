import { TRIVIA_POOL } from '../questions';
import type { AnswerResponse, FinishResponse, TriviaView } from '../apiTypes';
import { triviaPerformance, triviaStep } from '../scoring';
import {
  expectQuestion,
  listOf,
  numberOf,
  optionalQuestionIndex,
  pickIndices,
  RunError,
  secureRandomInt,
  shuffle,
  type RandomInt,
  type Step,
} from './shared';

export const TRIVIA_COUNT = 15;

export interface TriviaState {
  indices: number[];
  answers: string[];
  /** Running points: +20 right, -10 wrong, never below 0. */
  points: number;
}

export type TriviaAction =
  | { kind: 'answer'; answer: string; q?: number }
  | { kind: 'finish' };

export type TriviaResponse = Omit<AnswerResponse, 'done' | 'result'> | Omit<FinishResponse, 'done' | 'result'>;

export function startTrivia(rand: RandomInt = secureRandomInt): { state: TriviaState; view: { game: 'trivia'; questions: TriviaView[] } } {
  const indices = pickIndices(TRIVIA_POOL.length, TRIVIA_COUNT, rand);
  const questions = indices.map((i) => {
    const q = TRIVIA_POOL[i];
    return { question: q.question, options: shuffle(q.options, rand) };
  });
  return { state: { indices, answers: [], points: 0 }, view: { game: 'trivia', questions } };
}

export function hydrateTrivia(raw: Partial<TriviaState> | null | undefined): TriviaState {
  return {
    indices: listOf<number>(raw?.indices),
    answers: listOf<string>(raw?.answers),
    points: numberOf(raw?.points),
  };
}

export function parseTriviaAction(body: Record<string, unknown>): TriviaAction {
  if (body.finish === true) return { kind: 'finish' };
  if (typeof body.answer !== 'string') throw new RunError(400, 'answer must be a string or finish must be true');
  return { kind: 'answer', answer: body.answer, q: optionalQuestionIndex(body) };
}

export function applyTriviaAction(state: TriviaState, action: TriviaAction): Step<TriviaState, TriviaResponse> {
  if (action.kind === 'finish') {
    // Finalise with the answers so far. Unanswered questions are simply not counted.
    return {
      state,
      response: {},
      performance: triviaPerformance(state.points),
    };
  }

  const answered = state.answers.length;
  if (answered >= TRIVIA_COUNT) throw new RunError(409, 'This game is already finished');
  expectQuestion(action.q, answered);

  const question = TRIVIA_POOL[state.indices[answered]];
  if (action.answer !== '' && !question.options.includes(action.answer)) {
    throw new RunError(400, 'Answer is not one of the options');
  }
  const correct = action.answer === question.answer;
  const next: TriviaState = {
    indices: state.indices,
    answers: [...state.answers, action.answer],
    points: triviaStep(state.points, correct),
  };
  const finished = next.answers.length === TRIVIA_COUNT;
  return {
    state: next,
    response: { correct, correctAnswer: question.answer },
    performance: finished ? triviaPerformance(next.points) : undefined,
  };
}
