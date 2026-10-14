import { RIDDLE_POOL } from '../questions';
import type { AnswerResponse, RiddleView } from '../apiTypes';
import {
  expectQuestion,
  listOf,
  numberOf,
  requiredQuestionIndex,
  pickIndices,
  RunError,
  secureRandomInt,
  shuffle,
  type RandomInt,
  type Step,
} from './shared';

export const RIDDLE_COUNT = 5;

export interface RiddleState {
  /** Indices into RIDDLE_POOL, in the order they are asked. */
  indices: number[];
  /** Answer given for each question so far ('' = no answer). */
  answers: string[];
  correct: number;
}

export interface RiddleAction {
  answer: string;
  q: number;
}

export type RiddleResponse = Omit<AnswerResponse, 'done' | 'result'>;

export function startRiddles(
  picked?: number[],
  rand: RandomInt = secureRandomInt,
): { state: RiddleState; view: { game: 'riddles'; questions: RiddleView[] } } {
  const indices = picked ?? pickIndices(RIDDLE_POOL.length, RIDDLE_COUNT, rand);
  const questions = indices.map((i) => {
    const riddle = RIDDLE_POOL[i];
    return { emojis: riddle.emojis, hint: riddle.hint, options: shuffle(riddle.options, rand) };
  });
  return { state: { indices, answers: [], correct: 0 }, view: { game: 'riddles', questions } };
}

export function hydrateRiddles(raw: Partial<RiddleState> | null | undefined): RiddleState {
  return {
    indices: listOf<number>(raw?.indices),
    answers: listOf<string>(raw?.answers),
    correct: numberOf(raw?.correct),
  };
}

export function parseRiddleAction(body: Record<string, unknown>): RiddleAction {
  if (typeof body.answer !== 'string') throw new RunError(400, 'answer must be a string');
  return { answer: body.answer, q: requiredQuestionIndex(body) };
}

export function applyRiddleAnswer(state: RiddleState, action: RiddleAction): Step<RiddleState, RiddleResponse> {
  const answered = state.answers.length;
  if (answered >= RIDDLE_COUNT) throw new RunError(409, 'This game is already finished');
  expectQuestion(action.q, answered);

  const riddle = RIDDLE_POOL[state.indices[answered]];
  // '' counts as unanswered (wrong). Anything else must be one of the options shown.
  if (action.answer !== '' && !riddle.options.includes(action.answer)) {
    throw new RunError(400, 'Answer is not one of the options');
  }
  const correct = action.answer === riddle.answer;
  const next: RiddleState = {
    indices: state.indices,
    answers: [...state.answers, action.answer],
    correct: state.correct + (correct ? 1 : 0),
  };
  const finished = next.answers.length === RIDDLE_COUNT;
  return {
    state: next,
    response: { correct, correctAnswer: riddle.answer },
    performance: finished ? next.correct / RIDDLE_COUNT : undefined,
  };
}
