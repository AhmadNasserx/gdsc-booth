/**
 * @jest-environment node
 */
import { gradeRiddles, hydrateRiddles, parseRiddleBatch, RIDDLE_COUNT, startRiddles, type RiddleState } from '@/lib/runs/riddles';
import { RIDDLE_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';

const FIXED: RiddleState = { indices: [0, 1, 2, 3, 4] };

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
  it('fills in an indices list that RTDB dropped', () => {
    expect(hydrateRiddles(undefined)).toEqual({ indices: [] });
    expect(hydrateRiddles({ indices: { 0: 4, 1: 2 } } as unknown as Partial<RiddleState>).indices).toEqual([4, 2]);
  });
});

describe('parseRiddleBatch', () => {
  const five = (value: unknown) => ({ answers: [value, value, value, value, value] });

  it('reads one entry per riddle, each an option text or null', () => {
    const answers = ['Docker', null, '', null, 'Python'];
    expect(parseRiddleBatch({ answers })).toEqual(answers);
  });

  it('rejects a body without an answers array', () => {
    expect(statusOf(() => parseRiddleBatch({}))).toBe(400);
    expect(statusOf(() => parseRiddleBatch({ answers: 'Docker' }))).toBe(400);
    expect(statusOf(() => parseRiddleBatch({ answer: 'Docker', q: 0 }))).toBe(400);
  });

  it('requires exactly one entry per riddle', () => {
    expect(statusOf(() => parseRiddleBatch({ answers: [null, null, null, null] }))).toBe(400);
    expect(statusOf(() => parseRiddleBatch({ answers: [null, null, null, null, null, null] }))).toBe(400);
    expect(statusOf(() => parseRiddleBatch({ answers: [] }))).toBe(400);
  });

  it('rejects an entry that is not a string or null', () => {
    expect(statusOf(() => parseRiddleBatch(five(3)))).toBe(400);
    expect(statusOf(() => parseRiddleBatch(five({ text: 'Docker' })))).toBe(400);
    expect(statusOf(() => parseRiddleBatch({ answers: [null, null, null, null, false] }))).toBe(400);
  });

  it('accepts a batch of all nulls', () => {
    expect(parseRiddleBatch(five(null))).toEqual([null, null, null, null, null]);
  });

  it('exposes the question count the batch must match', () => {
    expect(RIDDLE_COUNT).toBe(5);
  });
});

describe('gradeRiddles', () => {
  it('grades every answer and reports performance as correct over five', () => {
    const answers = [RIDDLE_POOL[0].answer, RIDDLE_POOL[1].answer, RIDDLE_POOL[2].answer, null, null];
    const step = gradeRiddles(FIXED, answers);
    expect(step.performance).toBe(3 / 5);
    expect(step.response.results.map((r) => r.correct)).toEqual([true, true, true, false, false]);
  });

  it('returns a review entry for every question, with the correct answer and answered flag', () => {
    const answers = [RIDDLE_POOL[0].answer, null, RIDDLE_POOL[2].options.find((o) => o !== RIDDLE_POOL[2].answer) ?? null, null, null];
    const { results } = gradeRiddles(FIXED, answers).response;
    expect(results).toHaveLength(5);
    expect(results[0]).toEqual({ answered: true, correct: true, correctAnswer: RIDDLE_POOL[0].answer });
    expect(results[1]).toEqual({ answered: false, correct: false, correctAnswer: RIDDLE_POOL[1].answer });
    expect(results[2]).toEqual({ answered: true, correct: false, correctAnswer: RIDDLE_POOL[2].answer });
    expect(results.every((r) => !('explanation' in r))).toBe(true);
  });

  it('counts a null (open) riddle as wrong but still reveals its answer', () => {
    const { results } = gradeRiddles(FIXED, [null, null, null, null, null]).response;
    expect(results.map((r) => r.answered)).toEqual([false, false, false, false, false]);
    expect(results.map((r) => r.correctAnswer)).toEqual(FIXED.indices.map((i) => RIDDLE_POOL[i].answer));
  });

  it('gives performance 0 for an all-null batch and 1 for an all-correct one', () => {
    expect(gradeRiddles(FIXED, [null, null, null, null, null]).performance).toBe(0);
    const right = FIXED.indices.map((i) => RIDDLE_POOL[i].answer);
    expect(gradeRiddles(FIXED, right).performance).toBe(1);
  });

  it('rejects an answer that is not one of the options shown for that riddle', () => {
    expect(statusOf(() => gradeRiddles(FIXED, ['Definitely Not An Option', null, null, null, null]))).toBe(400);
  });

  it('rejects an empty string, which is not an option (null is the way to leave a riddle open)', () => {
    expect(statusOf(() => gradeRiddles(FIXED, ['', null, null, null, null]))).toBe(400);
  });

  it('does not change the state', () => {
    const state: RiddleState = { indices: [...FIXED.indices] };
    gradeRiddles(state, [null, null, null, null, null]);
    expect(state).toEqual(FIXED);
  });
});
