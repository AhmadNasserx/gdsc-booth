/**
 * @jest-environment node
 */
import { applyBugAnswer, hydrateBugs, parseBugAction, startBugs, type BugState } from '@/lib/runs/bugs';
import { BUG_POOL } from '@/lib/questions';
import { RunError } from '@/lib/runs/shared';

const FIXED: BugState = { indices: [0, 1, 2, 3, 4], answers: [], correct: 0 };

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
});

describe('hydrateBugs', () => {
  it('fills in a missing answers list', () => {
    expect(hydrateBugs({ indices: [0, 1, 2, 3, 4] }).answers).toEqual([]);
  });
});

describe('parseBugAction', () => {
  it('requires an integer line index', () => {
    expect(parseBugAction({ answer: 3 })).toEqual({ answer: 3, q: undefined });
    expect(() => parseBugAction({ answer: '3' })).toThrow(RunError);
    expect(() => parseBugAction({ answer: 1.5 })).toThrow(RunError);
    expect(() => parseBugAction({})).toThrow(RunError);
  });
});

describe('applyBugAnswer', () => {
  it('grades the correct line, with the explanation after answering', () => {
    const bug = BUG_POOL[0];
    const step = applyBugAnswer(FIXED, { answer: bug.answer });
    expect(step.response).toEqual({ correct: true, correctAnswer: bug.answer, explanation: bug.explanation });
    expect(step.state.correct).toBe(1);
  });

  it('grades a wrong line as wrong and still reveals the answer', () => {
    const bug = BUG_POOL[0];
    const wrongLine = bug.answer === 0 ? 1 : 0;
    const step = applyBugAnswer(FIXED, { answer: wrongLine });
    expect(step.response.correct).toBe(false);
    expect(step.response.correctAnswer).toBe(bug.answer);
  });

  it('rejects a line index outside the snippet', () => {
    const lines = BUG_POOL[0].lines.length;
    expect(() => applyBugAnswer(FIXED, { answer: lines })).toThrow(RunError);
    expect(() => applyBugAnswer(FIXED, { answer: -1 })).toThrow(RunError);
  });

  it('finishes after five answers with performance correct / 5', () => {
    let state: BugState = FIXED;
    let last;
    for (let i = 0; i < 5; i++) {
      const answer = i < 4 ? BUG_POOL[FIXED.indices[i]].answer : (BUG_POOL[FIXED.indices[i]].answer + 1) % BUG_POOL[FIXED.indices[i]].lines.length;
      last = applyBugAnswer(state, { answer });
      state = last.state;
    }
    expect(last?.performance).toBe(4 / 5);
  });

  it('refuses a sixth answer', () => {
    const done: BugState = { ...FIXED, answers: [0, 0, 0, 0, 0] };
    expect(() => applyBugAnswer(done, { answer: 0 })).toThrow(RunError);
  });

  it('enforces the question order when q is given', () => {
    expect(() => applyBugAnswer(FIXED, { answer: 0, q: 2 })).toThrow(RunError);
  });
});
