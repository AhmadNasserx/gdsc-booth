/**
 * @jest-environment node
 */
import { checkRiddle, gradeRiddles, hydrateRiddles, parseRiddleBatch, RIDDLE_COUNT, startRiddles, type RiddleState } from '@/lib/runs/riddles';
import { RIDDLE_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';

const FIXED: RiddleState = { indices: [0, 1, 2, 3, 4], given: [] };

const wrongOf = (poolIndex: number) => RIDDLE_POOL[poolIndex].options.find((o) => o !== RIDDLE_POOL[poolIndex].answer) as string;

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

  it('starts with no answers locked in', () => {
    expect(startRiddles().state.given).toEqual([]);
  });
});

describe('hydrateRiddles', () => {
  it('fills in an indices list that RTDB dropped', () => {
    expect(hydrateRiddles(undefined)).toEqual({ indices: [], given: [] });
    expect(hydrateRiddles({ indices: { 0: 4, 1: 2 } } as unknown as Partial<RiddleState>).indices).toEqual([4, 2]);
  });

  it('fills in an empty given list that RTDB dropped', () => {
    expect(hydrateRiddles({ indices: [4, 2] }).given).toEqual([]);
  });

  it('reads given answers that RTDB returned keyed by position, and never keeps more than there are questions', () => {
    const hydrated = hydrateRiddles({
      indices: [4, 2],
      given: { 0: 'Docker', 1: 'Python', 2: 'extra' } as unknown as string[],
    });
    expect(hydrated.given).toEqual(['Docker', 'Python']);
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
    const state: RiddleState = { indices: [...FIXED.indices], given: [] };
    gradeRiddles(state, [null, null, null, null, null]);
    expect(state).toEqual(FIXED);
  });
});

describe('checkRiddle', () => {
  const check = (state: RiddleState, index: number, answer: string) =>
    checkRiddle(state, { check: { index, answer } });

  it('records the first answer and reveals the correct answer for that riddle only', () => {
    const step = check(FIXED, 0, RIDDLE_POOL[0].answer);
    expect(step.response).toEqual({ index: 0, correct: true, correctAnswer: RIDDLE_POOL[0].answer });
    expect(step.state.given).toEqual([RIDDLE_POOL[0].answer]);
  });

  it('says a wrong answer is wrong, and still reveals only the riddle that was answered', () => {
    const step = check(FIXED, 0, wrongOf(0));
    expect(step.response).toEqual({ index: 0, correct: false, correctAnswer: RIDDLE_POOL[0].answer });
    expect(JSON.stringify(step.response)).not.toContain(RIDDLE_POOL[1].answer);
  });

  it('answers only with index, correct and correctAnswer', () => {
    const { response } = check(FIXED, 0, RIDDLE_POOL[0].answer);
    expect(Object.keys(response).sort()).toEqual(['correct', 'correctAnswer', 'index']);
  });

  it('builds on the answers already locked in, in order', () => {
    const first = check(FIXED, 0, wrongOf(0));
    const second = checkRiddle(first.state, { check: { index: 1, answer: RIDDLE_POOL[1].answer } });
    expect(second.state.given).toEqual([wrongOf(0), RIDDLE_POOL[1].answer]);
    expect(second.response).toMatchObject({ index: 1, correct: true });
  });

  it('a repeat check returns the stored result and ignores a different option, so it cannot probe the answer', () => {
    const first = check(FIXED, 0, wrongOf(0));
    const again = checkRiddle(first.state, { check: { index: 0, answer: RIDDLE_POOL[0].answer } });
    expect(again.response).toEqual(first.response);
    expect(again.response).toMatchObject({ correct: false });
    expect(again.state.given).toEqual([wrongOf(0)]);
  });

  it('rejects an index ahead of the next unanswered question with 409 and changes nothing', () => {
    expect(statusOf(() => check(FIXED, 2, RIDDLE_POOL[2].answer))).toBe(409);
    const withOne: RiddleState = { ...FIXED, given: [RIDDLE_POOL[0].answer] };
    expect(statusOf(() => check(withOne, 2, RIDDLE_POOL[2].answer))).toBe(409);
  });

  it('rejects an option that was not shown for that riddle with 400, even on a repeat', () => {
    expect(statusOf(() => check(FIXED, 0, 'Definitely Not An Option'))).toBe(400);
    const answered: RiddleState = { ...FIXED, given: [RIDDLE_POOL[0].answer] };
    expect(statusOf(() => check(answered, 0, 'Definitely Not An Option'))).toBe(400);
  });

  it.each([
    ['a negative index', { index: -1, answer: 'Docker' }],
    ['an index past the last riddle', { index: 5, answer: 'Docker' }],
    ['a fractional index', { index: 0.5, answer: 'Docker' }],
    ['a string index', { index: '0', answer: 'Docker' }],
    ['a missing answer', { index: 0 }],
    ['a non-string answer', { index: 0, answer: 3 }],
  ])('rejects %s with 400', (_label, value) => {
    expect(statusOf(() => checkRiddle(FIXED, { check: value }))).toBe(400);
  });

  it('rejects a check that is not an object', () => {
    expect(statusOf(() => checkRiddle(FIXED, { check: 'Docker' }))).toBe(400);
    expect(statusOf(() => checkRiddle(FIXED, { check: null }))).toBe(400);
    expect(statusOf(() => checkRiddle(FIXED, { check: [0, 'Docker'] }))).toBe(400);
  });

  it('does not change the state it is given', () => {
    const state: RiddleState = { indices: [...FIXED.indices], given: [] };
    check(state, 0, RIDDLE_POOL[0].answer);
    expect(state).toEqual(FIXED);
  });
});

describe('gradeRiddles with answers locked in by checks', () => {
  it('a locked-in answer wins over the batch value for the same riddle', () => {
    const state: RiddleState = { ...FIXED, given: [RIDDLE_POOL[0].answer] };
    // The batch says the first riddle was left open, or was answered wrongly. The check stands.
    const step = gradeRiddles(state, [null, null, null, null, null]);
    expect(step.response.results[0]).toEqual({ answered: true, correct: true, correctAnswer: RIDDLE_POOL[0].answer });
    expect(step.performance).toBe(1 / 5);
  });

  it('a wrong locked-in answer counts as wrong even if the batch repeats the right one', () => {
    const state: RiddleState = { ...FIXED, given: [wrongOf(0)] };
    const step = gradeRiddles(state, [RIDDLE_POOL[0].answer, null, null, null, null]);
    expect(step.response.results[0]).toMatchObject({ answered: true, correct: false });
    expect(step.performance).toBe(0);
  });

  it('riddles without a locked-in answer take the batch value', () => {
    const state: RiddleState = { ...FIXED, given: [RIDDLE_POOL[0].answer] };
    const step = gradeRiddles(state, [null, RIDDLE_POOL[1].answer, null, null, null]);
    expect(step.response.results.map((r) => r.correct)).toEqual([true, true, false, false, false]);
    expect(step.performance).toBe(2 / 5);
  });

  it('a batch value that is not an option is still refused for a riddle without a locked-in answer', () => {
    const state: RiddleState = { ...FIXED, given: [RIDDLE_POOL[0].answer] };
    expect(statusOf(() => gradeRiddles(state, [null, 'Not An Option', null, null, null]))).toBe(400);
  });
});
