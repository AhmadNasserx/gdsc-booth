/**
 * @jest-environment node
 */
import { applyRiddleAnswer, hydrateRiddles, parseRiddleAction, startRiddles, type RiddleState } from '@/lib/runs/riddles';
import { RIDDLE_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';

const FIXED: RiddleState = { indices: [0, 1, 2, 3, 4], answers: [], correct: 0 };

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof RunError ? err.status : -1;
  }
  return undefined;
}

describe('startRiddles', () => {
  it('asks five riddles with emojis, hint and options only', () => {
    const { view } = startRiddles();
    expect(view.game).toBe('riddles');
    expect(view.questions).toHaveLength(5);
    for (const q of view.questions) {
      expect(Object.keys(q).sort()).toEqual(['emojis', 'hint', 'options']);
      expect(q.options).toHaveLength(RIDDLE_POOL[0].options.length);
    }
  });

  it('never includes an answer field or the answer as a marked value', () => {
    const { view } = startRiddles();
    expect(JSON.stringify(view)).not.toContain('"answer"');
  });

  it('shows each riddle with all of its original options, in some order', () => {
    const { state, view } = startRiddles();
    state.indices.forEach((poolIndex, i) => {
      expect([...view.questions[i].options].sort()).toEqual([...RIDDLE_POOL[poolIndex].options].sort());
      expect(view.questions[i].hint).toBe(RIDDLE_POOL[poolIndex].hint);
    });
  });

  it('draws distinct riddles', () => {
    const { state } = startRiddles();
    expect(new Set(state.indices).size).toBe(5);
  });
});

describe('hydrateRiddles', () => {
  it('fills in an empty answers list that RTDB dropped', () => {
    expect(hydrateRiddles({ indices: [0, 1, 2, 3, 4], correct: 0 }).answers).toEqual([]);
  });
});

describe('parseRiddleAction', () => {
  it('requires a string answer', () => {
    expect(() => parseRiddleAction({ answer: 3, q: 0 })).toThrow(RunError);
    expect(() => parseRiddleAction({ q: 0 })).toThrow(RunError);
  });

  it('requires the question index q', () => {
    expect(statusOf(() => parseRiddleAction({ answer: 'Docker' }))).toBe(400);
    expect(statusOf(() => parseRiddleAction({ answer: 'Docker', q: '2' }))).toBe(400);
  });

  it('reads answer and q', () => {
    expect(parseRiddleAction({ answer: 'Docker', q: 2 })).toEqual({ answer: 'Docker', q: 2 });
    expect(parseRiddleAction({ answer: '', q: 0 })).toEqual({ answer: '', q: 0 });
  });

  it('rejects a negative or fractional question index', () => {
    expect(() => parseRiddleAction({ answer: 'x', q: -1 })).toThrow(RunError);
    expect(() => parseRiddleAction({ answer: 'x', q: 1.5 })).toThrow(RunError);
  });
});

describe('applyRiddleAnswer', () => {
  const right = RIDDLE_POOL[0].answer;
  const wrong = RIDDLE_POOL[0].options.find((o) => o !== right) as string;

  it('grades a right answer and reveals the correct answer afterwards', () => {
    const step = applyRiddleAnswer(FIXED, { answer: right, q: 0 });
    expect(step.response).toEqual({ correct: true, correctAnswer: right });
    expect(step.state.correct).toBe(1);
    expect(step.state.answers).toEqual([right]);
    expect(step.performance).toBeUndefined();
  });

  it('grades a wrong option as wrong', () => {
    const step = applyRiddleAnswer(FIXED, { answer: wrong, q: 0 });
    expect(step.response).toEqual({ correct: false, correctAnswer: right });
    expect(step.state.correct).toBe(0);
  });

  it('counts an empty answer as unanswered (wrong)', () => {
    const step = applyRiddleAnswer(FIXED, { answer: '', q: 0 });
    expect(step.response.correct).toBe(false);
    expect(step.state.answers).toEqual(['']);
  });

  it('rejects text that is not one of the options', () => {
    expect(() => applyRiddleAnswer(FIXED, { answer: 'Definitely Not An Option', q: 0 })).toThrow(RunError);
  });

  it('answers in order: a question index other than the open one is 409 and changes nothing', () => {
    expect(statusOf(() => applyRiddleAnswer(FIXED, { answer: right, q: 1 }))).toBe(409);
    expect(statusOf(() => applyRiddleAnswer(FIXED, { answer: right, q: 4 }))).toBe(409);
    expect(() => applyRiddleAnswer(FIXED, { answer: right, q: 0 })).not.toThrow();
  });

  it('a retried answer for an already answered question is refused', () => {
    const first = applyRiddleAnswer(FIXED, { answer: '', q: 0 });
    expect(statusOf(() => applyRiddleAnswer(first.state, { answer: '', q: 0 }))).toBe(409);
  });

  it('finishes after five answers with performance correct / 5', () => {
    let state: RiddleState = FIXED;
    let last;
    for (let i = 0; i < 5; i++) {
      const correctAnswer = RIDDLE_POOL[state.indices[i]].answer;
      last = applyRiddleAnswer(state, { answer: i < 3 ? correctAnswer : '', q: i });
      state = last.state;
    }
    expect(last?.performance).toBe(3 / 5);
  });

  it('gives performance 0 when every answer is wrong', () => {
    let state: RiddleState = FIXED;
    let last;
    for (let i = 0; i < 5; i++) {
      last = applyRiddleAnswer(state, { answer: '', q: i });
      state = last.state;
    }
    expect(last?.performance).toBe(0);
  });

  it('refuses an answer after the last question', () => {
    const done: RiddleState = { indices: [0, 1, 2, 3, 4], answers: ['a', 'b', 'c', 'd', 'e'], correct: 0 };
    expect(() => applyRiddleAnswer(done, { answer: '', q: 5 })).toThrow(RunError);
  });
});
