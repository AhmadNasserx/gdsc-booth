import { BUG_POOL } from '../questions';
import type { AnswerResponse, BugView } from '../apiTypes';
import {
  expectQuestion,
  listOf,
  numberOf,
  optionalQuestionIndex,
  pickIndices,
  RunError,
  secureRandomInt,
  type RandomInt,
  type Step,
} from './shared';

export const BUG_COUNT = 5;

export interface BugState {
  indices: number[];
  /** 0-based line index chosen for each question so far. */
  answers: number[];
  correct: number;
}

export interface BugAction {
  answer: number;
  q?: number;
}

export type BugResponse = Omit<AnswerResponse, 'done' | 'result'>;

export function startBugs(rand: RandomInt = secureRandomInt): { state: BugState; view: { game: 'bugs'; questions: BugView[] } } {
  const indices = pickIndices(BUG_POOL.length, BUG_COUNT, rand);
  const questions = indices.map((i) => {
    const bug = BUG_POOL[i];
    return { title: bug.title, language: bug.language, lines: [...bug.lines] };
  });
  return { state: { indices, answers: [], correct: 0 }, view: { game: 'bugs', questions } };
}

export function hydrateBugs(raw: Partial<BugState> | null | undefined): BugState {
  return {
    indices: listOf<number>(raw?.indices),
    answers: listOf<number>(raw?.answers),
    correct: numberOf(raw?.correct),
  };
}

export function parseBugAction(body: Record<string, unknown>): BugAction {
  if (!Number.isInteger(body.answer)) throw new RunError(400, 'answer must be a line index');
  return { answer: body.answer as number, q: optionalQuestionIndex(body) };
}

export function applyBugAnswer(state: BugState, action: BugAction): Step<BugState, BugResponse> {
  const answered = state.answers.length;
  if (answered >= BUG_COUNT) throw new RunError(409, 'This game is already finished');
  expectQuestion(action.q, answered);

  const bug = BUG_POOL[state.indices[answered]];
  if (action.answer < 0 || action.answer >= bug.lines.length) {
    throw new RunError(400, 'Line index is out of range');
  }
  const correct = action.answer === bug.answer;
  const next: BugState = {
    indices: state.indices,
    answers: [...state.answers, action.answer],
    correct: state.correct + (correct ? 1 : 0),
  };
  const finished = next.answers.length === BUG_COUNT;
  return {
    state: next,
    response: { correct, correctAnswer: bug.answer, explanation: bug.explanation },
    performance: finished ? next.correct / BUG_COUNT : undefined,
  };
}
