/**
 * @jest-environment node
 */
import { gradeTrivia, hydrateTrivia, parseTriviaBatch, startTrivia, TRIVIA_COUNT, type TriviaState } from '@/lib/runs/trivia';
import { TRIVIA_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';
import { triviaPerformance } from '@/lib/scoring';

const ALL_INDICES = Array.from({ length: 15 }, (_, i) => i);
const FRESH: TriviaState = { indices: ALL_INDICES };

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
    expect(hydrateTrivia(null)).toEqual({ indices: [] });
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
