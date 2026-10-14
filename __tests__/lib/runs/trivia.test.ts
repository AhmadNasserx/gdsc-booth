/**
 * @jest-environment node
 */
import { applyTriviaAction, hydrateTrivia, parseTriviaAction, startTrivia, type TriviaState } from '@/lib/runs/trivia';
import { TRIVIA_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';

const ALL_INDICES = Array.from({ length: 15 }, (_, i) => i);
const FRESH: TriviaState = { indices: ALL_INDICES, answers: [], points: 0 };

describe('startTrivia', () => {
  it('asks 15 distinct questions with options only', () => {
    const { state, view } = startTrivia();
    expect(view.game).toBe('trivia');
    expect(view.questions).toHaveLength(15);
    expect(new Set(state.indices).size).toBe(15);
    for (const q of view.questions) {
      expect(Object.keys(q).sort()).toEqual(['options', 'question']);
    }
    expect(JSON.stringify(view)).not.toContain('"answer"');
  });
});

describe('hydrateTrivia', () => {
  it('fills in a missing answers list', () => {
    expect(hydrateTrivia({ indices: ALL_INDICES, points: 20 }).answers).toEqual([]);
  });
});

describe('parseTriviaAction', () => {
  it('reads {finish:true} as a finish', () => {
    expect(parseTriviaAction({ finish: true })).toEqual({ kind: 'finish' });
  });

  it('reads a string answer', () => {
    expect(parseTriviaAction({ answer: 'Flutter' })).toEqual({ kind: 'answer', answer: 'Flutter' });
  });

  it('rejects a body with neither an answer nor a finish', () => {
    expect(() => parseTriviaAction({})).toThrow(RunError);
    expect(() => parseTriviaAction({ finish: false })).toThrow(RunError);
    expect(() => parseTriviaAction({ answer: 2 })).toThrow(RunError);
  });
});

describe('applyTriviaAction', () => {
  const rightOf = (i: number) => TRIVIA_POOL[i].answer;

  it('adds 20 points for a right answer', () => {
    const step = applyTriviaAction(FRESH, { kind: 'answer', answer: rightOf(0) });
    expect(step.state.points).toBe(20);
    expect(step.response).toEqual({ correct: true, correctAnswer: rightOf(0) });
  });

  it('takes 10 points for a wrong answer, never below zero', () => {
    const step = applyTriviaAction(FRESH, { kind: 'answer', answer: '' });
    expect(step.state.points).toBe(0);
    expect(step.response.correct).toBe(false);
  });

  it('rejects text that is not one of the options', () => {
    expect(() => applyTriviaAction(FRESH, { kind: 'answer', answer: 'nope' })).toThrow(RunError);
  });

  it('evolves points over several answers: right, wrong, right, right', () => {
    let state = FRESH;
    const picks = [true, false, true, true];
    picks.forEach((right, i) => {
      state = applyTriviaAction(state, { kind: 'answer', answer: right ? rightOf(i) : '' }).state;
    });
    expect(state.points).toBe(20 - 10 + 20 + 20);
  });

  it('finishes when the 15th question is answered, with performance from the points', () => {
    let state = FRESH;
    let last;
    for (let i = 0; i < 15; i++) {
      last = applyTriviaAction(state, { kind: 'answer', answer: rightOf(i) });
      state = last.state;
    }
    expect(last?.performance).toBe(1);
  });

  it('finishes early on {finish:true} with the answers so far', () => {
    let state = FRESH;
    for (let i = 0; i < 3; i++) state = applyTriviaAction(state, { kind: 'answer', answer: rightOf(i) }).state;
    const step = applyTriviaAction(state, { kind: 'finish' });
    expect(step.performance).toBeCloseTo(60 / 300);
    expect(step.response).toEqual({});
  });

  it('finishing with no answers gives zero performance', () => {
    expect(applyTriviaAction(FRESH, { kind: 'finish' }).performance).toBe(0);
  });

  it('refuses a 16th answer', () => {
    const done = { ...FRESH, answers: Array(15).fill('x') };
    expect(() => applyTriviaAction(done, { kind: 'answer', answer: '' })).toThrow(RunError);
  });

  it('enforces the question order when q is given', () => {
    expect(() => applyTriviaAction(FRESH, { kind: 'answer', answer: '', q: 4 })).toThrow(RunError);
    expect(() => applyTriviaAction(FRESH, { kind: 'answer', answer: '', q: 0 })).not.toThrow();
  });
});
