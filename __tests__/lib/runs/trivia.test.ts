/**
 * @jest-environment node
 */
import { checkTrivia, gradeTrivia, hydrateTrivia, parseTriviaBatch, startTrivia, TRIVIA_COUNT, type TriviaState } from '@/lib/runs/trivia';
import { TRIVIA_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';
import { triviaPerformance } from '@/lib/scoring';

const ALL_INDICES = Array.from({ length: 15 }, (_, i) => i);
const FRESH: TriviaState = { indices: ALL_INDICES, given: [] };

const rightOf = (i: number) => TRIVIA_POOL[ALL_INDICES[i]].answer;
const wrongOf = (i: number) => TRIVIA_POOL[ALL_INDICES[i]].options.find((o) => o !== rightOf(i)) as string;

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof RunError ? err.status : -1;
  }
  return undefined;
}

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

  it('uses the picked pool indices when given', () => {
    const picked = Array.from({ length: 15 }, (_, i) => i + 2);
    expect(startTrivia(picked).state.indices).toEqual(picked);
  });
});

describe('hydrateTrivia', () => {
  it('keeps the question indices and fills in a missing list', () => {
    expect(hydrateTrivia({ indices: ALL_INDICES })).toEqual(FRESH);
    expect(hydrateTrivia(null)).toEqual({ indices: [], given: [] });
  });

  it('reads given answers that RTDB returned keyed by position, and never keeps more than there are questions', () => {
    const hydrated = hydrateTrivia({ indices: [3, 7], given: { 0: 'Flutter', 1: 'Angular', 2: 'extra' } as unknown as string[] });
    expect(hydrated.given).toEqual(['Flutter', 'Angular']);
  });
});

describe('parseTriviaBatch', () => {
  it('reads up to 15 entries, each an option text or null', () => {
    expect(parseTriviaBatch({ answers: ['Flutter', null] })).toEqual(['Flutter', null]);
    expect(TRIVIA_COUNT).toBe(15);
  });

  it('accepts an empty batch, which scores nothing', () => {
    expect(parseTriviaBatch({ answers: [] })).toEqual([]);
  });

  it('rejects more than 15 entries', () => {
    expect(statusOf(() => parseTriviaBatch({ answers: Array(16).fill(null) }))).toBe(400);
  });

  it('rejects a missing answers array or a wrong entry type', () => {
    expect(statusOf(() => parseTriviaBatch({}))).toBe(400);
    expect(statusOf(() => parseTriviaBatch({ answers: { 0: 'x' } }))).toBe(400);
    expect(statusOf(() => parseTriviaBatch({ answers: [4] }))).toBe(400);
    expect(statusOf(() => parseTriviaBatch({ answer: 'Flutter', q: 0 }))).toBe(400);
    expect(statusOf(() => parseTriviaBatch({ finish: true }))).toBe(400);
  });
});

describe('gradeTrivia', () => {
  it('adds 20 points for a right answer', () => {
    const step = gradeTrivia(FRESH, [rightOf(0)]);
    expect(step.response.results[0]).toEqual({ answered: true, correct: true, correctAnswer: rightOf(0) });
    expect(step.performance).toBeCloseTo(triviaPerformance(20));
  });

  it('takes 10 points for a wrong answer, never below zero', () => {
    const step = gradeTrivia(FRESH, [wrongOf(0)]);
    expect(step.response.results[0]).toMatchObject({ answered: true, correct: false });
    expect(step.performance).toBe(0);
  });

  it('applies points in order, so a floor hit early is not undone by later answers', () => {
    // In order: 0, 0, 20. Summed first and floored at the end the total would be 0.
    const step = gradeTrivia(FRESH, [wrongOf(0), wrongOf(1), rightOf(2)]);
    expect(step.performance).toBeCloseTo(triviaPerformance(20));
  });

  it('evolves points over several answers: right, wrong, right, right gives 50', () => {
    const step = gradeTrivia(FRESH, [rightOf(0), wrongOf(1), rightOf(2), rightOf(3)]);
    expect(step.performance).toBeCloseTo(triviaPerformance(20 - 10 + 20 + 20));
  });

  it('skips a null answer: no points change, and the question is reported as unanswered', () => {
    const step = gradeTrivia(FRESH, [rightOf(0), null, wrongOf(2)]);
    expect(step.response.results[1]).toEqual({ answered: false, correct: false, correctAnswer: rightOf(1) });
    // 20, then skip, then 10 after the wrong answer
    expect(step.performance).toBeCloseTo(triviaPerformance(10));
  });

  it('a skipped question between two wrong answers does not add a penalty', () => {
    const step = gradeTrivia(FRESH, [wrongOf(0), null, wrongOf(2), rightOf(3)]);
    // 0, skip, 0, 20
    expect(step.performance).toBeCloseTo(triviaPerformance(20));
  });

  it('returns a review entry for every one of the 15 questions, including ones past the batch', () => {
    const { results } = gradeTrivia(FRESH, [rightOf(0), null]).response;
    expect(results).toHaveLength(15);
    expect(results.slice(2).every((r) => r.answered === false)).toBe(true);
    expect(results[14].correctAnswer).toBe(rightOf(14));
  });

  it('gives full performance for 15 right answers and zero for an empty batch', () => {
    const all = ALL_INDICES.map((_, i) => rightOf(i));
    expect(gradeTrivia(FRESH, all).performance).toBe(1);
    expect(gradeTrivia(FRESH, []).performance).toBe(0);
  });

  it('rejects text that is not one of the options for that question', () => {
    expect(statusOf(() => gradeTrivia(FRESH, ['nope']))).toBe(400);
    expect(statusOf(() => gradeTrivia(FRESH, [''] ))).toBe(400);
  });
});

describe('startTrivia answers', () => {
  it('starts with no answers locked in', () => {
    expect(startTrivia().state.given).toEqual([]);
  });
});

describe('checkTrivia', () => {
  const check = (state: TriviaState, index: number, answer: string) => checkTrivia(state, { check: { index, answer } });

  it('records the first answer and reveals the correct answer for that question only', () => {
    const step = check(FRESH, 0, rightOf(0));
    expect(step.response).toEqual({ index: 0, correct: true, correctAnswer: rightOf(0) });
    expect(step.state.given).toEqual([rightOf(0)]);
  });

  it('says a wrong answer is wrong and reveals no other question', () => {
    const step = check(FRESH, 0, wrongOf(0));
    expect(step.response).toEqual({ index: 0, correct: false, correctAnswer: rightOf(0) });
    expect(JSON.stringify(step.response)).not.toContain(rightOf(1));
  });

  it('does not count points while the round is being played', () => {
    const step = check(FRESH, 0, wrongOf(0));
    expect(step).not.toHaveProperty('performance');
  });

  it('a repeat check returns the stored result and ignores a different option', () => {
    const first = check(FRESH, 0, wrongOf(0));
    const again = checkTrivia(first.state, { check: { index: 0, answer: rightOf(0) } });
    expect(again.response).toEqual(first.response);
    expect(again.state.given).toEqual([wrongOf(0)]);
  });

  it('rejects an index ahead of the next unanswered question with 409', () => {
    expect(statusOf(() => check(FRESH, 1, rightOf(1)))).toBe(409);
    expect(statusOf(() => check({ ...FRESH, given: [rightOf(0)] }, 2, rightOf(2)))).toBe(409);
  });

  it('rejects an option that was not offered for that question with 400', () => {
    expect(statusOf(() => check(FRESH, 0, 'not an option'))).toBe(400);
    expect(statusOf(() => check({ ...FRESH, given: [rightOf(0)] }, 0, 'not an option'))).toBe(400);
  });

  it('rejects an index outside the 15 questions with 400', () => {
    expect(statusOf(() => checkTrivia(FRESH, { check: { index: 15, answer: rightOf(0) } }))).toBe(400);
    expect(statusOf(() => checkTrivia(FRESH, { check: { index: -1, answer: rightOf(0) } }))).toBe(400);
    expect(statusOf(() => checkTrivia(FRESH, { check: { index: 1.5, answer: rightOf(0) } }))).toBe(400);
  });

  it('rejects a body with no check object', () => {
    expect(statusOf(() => checkTrivia(FRESH, {}))).toBe(400);
    expect(statusOf(() => checkTrivia(FRESH, { check: { index: 0 } }))).toBe(400);
  });
});

describe('gradeTrivia with answers locked in by checks', () => {
  it('a locked-in answer is scored even when the batch leaves that question open', () => {
    const state: TriviaState = { ...FRESH, given: [rightOf(0)] };
    const step = gradeTrivia(state, []);
    expect(step.response.results[0]).toEqual({ answered: true, correct: true, correctAnswer: rightOf(0) });
    expect(step.performance).toBeCloseTo(triviaPerformance(20));
  });

  it('a locked-in answer beats a different batch value for the same question', () => {
    const state: TriviaState = { ...FRESH, given: [wrongOf(0)] };
    const step = gradeTrivia(state, [rightOf(0), rightOf(1)]);
    expect(step.response.results[0]).toMatchObject({ answered: true, correct: false });
    // 0 after the wrong answer, then 20 for the batch's right answer to question 2
    expect(step.performance).toBeCloseTo(triviaPerformance(20));
  });

  it('points run in order over locked-in and batch answers together', () => {
    // Locked in: right (20). Batch: question 2 wrong (10), question 3 right (30).
    const state: TriviaState = { ...FRESH, given: [rightOf(0)] };
    const step = gradeTrivia(state, [null, wrongOf(1), rightOf(2)]);
    expect(step.performance).toBeCloseTo(triviaPerformance(20 - 10 + 20));
  });

  it('a locked-in wrong answer followed by a batch skip scores the floor, not a negative total', () => {
    const state: TriviaState = { ...FRESH, given: [wrongOf(0)] };
    expect(gradeTrivia(state, [null]).performance).toBe(0);
  });

  it('the batch does not change the locked-in state', () => {
    const state: TriviaState = { ...FRESH, given: [rightOf(0)] };
    gradeTrivia(state, [wrongOf(0)]);
    expect(state.given).toEqual([rightOf(0)]);
  });
});
