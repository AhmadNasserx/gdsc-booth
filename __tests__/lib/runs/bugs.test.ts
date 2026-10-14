/**
 * @jest-environment node
 */
import { gradeBugs, hydrateBugs, parseBugBatch, startBugs, type BugState } from '@/lib/runs/bugs';
import { BUG_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';

const FIXED: BugState = { indices: [0, 1, 2, 3, 4] };

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof RunError ? err.status : -1;
  }
  return undefined;
}

describe('startBugs', () => {
  it('shows five snippets with title, language and lines only', () => {
    const { view } = startBugs();
    expect(view.game).toBe('bugs');
    expect(view.questions).toHaveLength(5);
    for (const q of view.questions) {
      expect(Object.keys(q).sort()).toEqual(['language', 'lines', 'title']);
    }
    expect(JSON.stringify(view)).not.toContain('explanation');
  });

  it('shows each snippet exactly as the pool has it, so line indices match the answer', () => {
    const { state, view } = startBugs();
    state.indices.forEach((poolIndex, i) => {
      expect(view.questions[i].lines).toEqual(BUG_POOL[poolIndex].lines);
    });
  });

  it('uses the picked pool indices when given', () => {
    const { state } = startBugs([3, 4, 5, 6, 7]);
    expect(state.indices).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('hydrateBugs', () => {
  it('fills in a missing indices list', () => {
    expect(hydrateBugs(undefined)).toEqual({ indices: [] });
  });
});

describe('parseBugBatch', () => {
  it('reads one entry per snippet: a line index or null', () => {
    expect(parseBugBatch({ answers: [3, null, 0, null, 1] })).toEqual([3, null, 0, null, 1]);
  });

  it('requires exactly five entries', () => {
    expect(statusOf(() => parseBugBatch({ answers: [0, 0, 0, 0] }))).toBe(400);
    expect(statusOf(() => parseBugBatch({ answers: [0, 0, 0, 0, 0, 0] }))).toBe(400);
  });

  it('rejects a non-integer, a string or a missing array', () => {
    expect(statusOf(() => parseBugBatch({ answers: [1.5, null, null, null, null] }))).toBe(400);
    expect(statusOf(() => parseBugBatch({ answers: ['2', null, null, null, null] }))).toBe(400);
    expect(statusOf(() => parseBugBatch({ answer: 3, q: 0 }))).toBe(400);
    expect(statusOf(() => parseBugBatch({}))).toBe(400);
  });
});

describe('gradeBugs', () => {
  it('reports the buggy line and the explanation for every snippet', () => {
    const answers = FIXED.indices.map((i) => BUG_POOL[i].answer);
    const step = gradeBugs(FIXED, answers);
    expect(step.performance).toBe(1);
    step.response.results.forEach((r, i) => {
      expect(r).toEqual({
        answered: true,
        correct: true,
        correctAnswer: BUG_POOL[FIXED.indices[i]].answer,
        explanation: BUG_POOL[FIXED.indices[i]].explanation,
      });
    });
  });

  it('grades a wrong line as wrong and still reveals the answer', () => {
    const bug = BUG_POOL[0];
    const wrongLine = bug.answer === 0 ? 1 : 0;
    const { results } = gradeBugs(FIXED, [wrongLine, null, null, null, null]).response;
    expect(results[0]).toMatchObject({ answered: true, correct: false, correctAnswer: bug.answer });
  });

  it('counts null snippets as wrong, unanswered, and still shows their explanation', () => {
    const step = gradeBugs(FIXED, [null, null, null, null, null]);
    expect(step.performance).toBe(0);
    expect(step.response.results.every((r) => r.answered === false && r.explanation !== undefined)).toBe(true);
  });

  it('gives performance as correct over five', () => {
    const answers = FIXED.indices.map((i, k) => (k < 4 ? BUG_POOL[i].answer : null));
    expect(gradeBugs(FIXED, answers).performance).toBe(4 / 5);
  });

  it('rejects a line index outside the snippet', () => {
    const lines = BUG_POOL[0].lines.length;
    expect(statusOf(() => gradeBugs(FIXED, [lines, null, null, null, null]))).toBe(400);
    expect(statusOf(() => gradeBugs(FIXED, [-1, null, null, null, null]))).toBe(400);
  });
});
