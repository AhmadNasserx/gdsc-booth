/**
 * @jest-environment node
 */
import { transition } from '@/lib/runs/transition';
import { RunError, type RunRecord } from '@/lib/runs/shared';
import { startGame } from '@/lib/runs';
import { calcRunScore } from '@/lib/scoring';
import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';

const T0 = 1_700_000_000_000;
const SESSION = 'session-1';
const NONE = { answers: [null, null, null, null, null] };

function runFor(game: 'riddles' | 'memory' | 'trivia', overrides: Partial<RunRecord> = {}): RunRecord {
  const { state } = startGame(game);
  return {
    sessionId: SESSION,
    game,
    normKey: 'ahmad',
    name: 'Ahmad',
    startedAt: T0,
    lastActionAt: T0,
    status: 'active',
    expiresAt: T0 + 2 * 60 * 60 * 1000,
    state,
    ...overrides,
  };
}

/** Deep-frozen so any accidental mutation throws in strict mode. */
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof RunError ? err.status : -1;
  }
  return undefined;
}

describe('transition: gates', () => {
  it('404 for another session', () => {
    expect(statusOf(() => transition(runFor('memory'), 'other', { flip: 0 }, T0 + 1000))).toBe(404);
  });

  it('409 for a replaced run', () => {
    const run = runFor('memory', { status: 'abandoned' });
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 1000))).toBe(409);
  });

  it('409 for a finished run whose leaderboard entry is settled, when the body is not a batch', () => {
    const run = runFor('memory', { status: 'done', final: { score: 1, durationMs: 1, response: {}, settled: true } });
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 1000))).toBe(409);
  });

  it('a finished run that is not yet settled is handed back for settling', () => {
    const run = runFor('memory', { status: 'done', final: { score: 1, durationMs: 1, response: {}, settled: false } });
    const t = transition(run, SESSION, { flip: 0 }, T0 + 1000);
    expect(t.kind).toBe('settle');
  });

  it('409 once the run has passed its expiry', () => {
    const run = runFor('memory', { expiresAt: T0 + 1000 });
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 1000))).toBe(409);
  });

  it('429 inside the throttle window and allowed at exactly the window', () => {
    const run = runFor('riddles');
    expect(statusOf(() => transition(run, SESSION, NONE, T0 + 299))).toBe(429);
    expect(statusOf(() => transition(run, SESSION, NONE, T0 + 300))).toBeUndefined();
  });

  it('memory uses the 120ms window', () => {
    const run = runFor('memory');
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 119))).toBe(429);
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 120))).toBeUndefined();
  });

  it('a rejected body is a 400 and leaves the run untouched', () => {
    const run = frozen(runFor('riddles'));
    expect(statusOf(() => transition(run, SESSION, { flip: 1 }, T0 + 1000))).toBe(400);
    expect(statusOf(() => transition(run, SESSION, { answers: 'x' }, T0 + 1000))).toBe(400);
    expect(statusOf(() => transition(run, SESSION, { answers: [null] }, T0 + 1000))).toBe(400);
  });
});

describe('transition: applying actions', () => {
  it('moves lastActionAt to now and keeps the run active while the game goes on', () => {
    const run = frozen(runFor('memory'));
    const t = transition(run, SESSION, { flip: 0 }, T0 + 1000);
    expect(t).toMatchObject({ kind: 'applied', finished: false, next: { status: 'active', lastActionAt: T0 + 1000 } });
    expect(run.lastActionAt).toBe(T0);
  });

  it('a finishing action marks the run done and stores the score for the elapsed time', () => {
    const run = runFor('riddles');
    const now = T0 + 12_000;
    const answers = (run.state as { indices: number[] }).indices.map((i) => RIDDLE_POOL[i].answer);
    const t = transition(run, SESSION, { answers }, now);
    expect(t.kind).toBe('applied');
    if (t.kind !== 'applied') return;
    expect(t.finished).toBe(true);
    expect(t.next.status).toBe('done');
    expect(t.next.final).toMatchObject({
      score: calcRunScore('riddles', 1, 12_000),
      durationMs: 12_000,
      settled: false,
    });
  });

  it('measures the duration from the start of the run, not from the last action', () => {
    const run = runFor('riddles', { lastActionAt: T0 + 5000 });
    const t = transition(run, SESSION, NONE, T0 + 6000);
    expect(t.kind === 'applied' && t.next.final?.durationMs).toBe(6000);
  });

  it('a clock that reads before the last action counts as too fast rather than going negative', () => {
    const run = runFor('riddles', { lastActionAt: T0 + 1000 });
    expect(statusOf(() => transition(run, SESSION, NONE, T0 + 500))).toBe(429);
  });
});

describe('transition: batch games', () => {
  const RIGHT = (run: RunRecord) => (run.state as { indices: number[] }).indices.map((i) => RIDDLE_POOL[i].answer);

  it('a batch finishes the run in one step and stores the review as the reply', () => {
    const run = runFor('riddles');
    const answers = RIGHT(run).map((a, i) => (i < 2 ? a : null));
    const t = transition(run, SESSION, { answers }, T0 + 2500);
    expect(t).toMatchObject({ kind: 'applied', finished: true, next: { status: 'done', lastActionAt: T0 + 2500 } });
    if (t.kind !== 'applied') return;
    expect(t.next.final).toMatchObject({ durationMs: 2500, settled: false });
    expect(t.next.final?.score).toBe(calcRunScore('riddles', 2 / 5, 2500));
    expect(t.next.final?.response).toMatchObject({ results: expect.any(Array) });
    expect((t.next.final?.response.results as unknown[]).length).toBe(5);
  });

  it('a batch of nothing answered still finishes the run and scores zero', () => {
    const t = transition(runFor('riddles'), SESSION, NONE, T0 + 300);
    expect(t).toMatchObject({ kind: 'applied', finished: true });
    if (t.kind === 'applied') expect(t.next.final?.score).toBe(0);
  });

  it('429 "Too fast" while the time since the start is under 500ms per answered question', () => {
    const run = runFor('riddles');
    const answers = [RIGHT(run)[0], null, null, null, null];
    expect(statusOf(() => transition(run, SESSION, { answers }, T0 + 499))).toBe(429);
    expect(statusOf(() => transition(run, SESSION, { answers }, T0 + 500))).toBeUndefined();
  });

  it('the plausibility limit counts only answered questions, so an open batch is not held back', () => {
    const run = runFor('riddles');
    expect(statusOf(() => transition(run, SESSION, NONE, T0 + 300))).toBeUndefined();
  });

  it('the plausibility check uses the time since the start, not since the last action', () => {
    const run = runFor('trivia', { lastActionAt: T0 + 2000 });
    const answers = (run.state as { indices: number[] }).indices.slice(0, 5).map((i) => TRIVIA_POOL[i].answer);
    expect(statusOf(() => transition(run, SESSION, { answers }, T0 + 2400))).toBe(429);
    expect(statusOf(() => transition(run, SESSION, { answers }, T0 + 2500))).toBeUndefined();
  });

  it('a too-fast batch changes nothing', () => {
    const run = frozen(runFor('riddles'));
    expect(statusOf(() => transition(run, SESSION, { answers: [RIGHT(run)[0], null, null, null, null] }, T0 + 400))).toBe(429);
  });
});

describe('transition: a finished batch', () => {
  function finishedBatch(settled: boolean): RunRecord {
    const run = runFor('riddles');
    const reply = { results: [{ answered: true, correct: true, correctAnswer: 'x' }], done: true, result: { score: 1 } };
    return { ...run, status: 'done', final: { score: 900, durationMs: 3000, response: settled ? reply : { results: reply.results }, settled } };
  }

  it('sends the stored reply again, unchanged, for a repeated batch', () => {
    const run = finishedBatch(true);
    const t = transition(run, SESSION, { answers: [null, null, null, null, null] }, T0 + 9000);
    expect(t).toEqual({ kind: 'replay', response: run.final?.response });
  });

  it('replays regardless of the answers sent the second time', () => {
    const run = finishedBatch(true);
    const t = transition(run, SESSION, { answers: ['not an option', null, null, null, null] }, T0 + 9000);
    expect(t.kind).toBe('replay');
  });

  it('a repeated batch with a malformed body is 400', () => {
    expect(statusOf(() => transition(finishedBatch(true), SESSION, { answers: [1, 2] }, T0 + 9000))).toBe(400);
  });

  it('any other action on a finished batch run is 409', () => {
    const run = finishedBatch(true);
    expect(statusOf(() => transition(run, SESSION, { guess: 'REACT' }, T0 + 9000))).toBe(409);
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 9000))).toBe(409);
    expect(statusOf(() => transition(run, SESSION, { answer: '', q: 0 }, T0 + 9000))).toBe(409);
  });

  it('an unsettled finished batch is settled whatever the body is', () => {
    const t = transition(finishedBatch(false), SESSION, { guess: 'REACT' }, T0 + 9000);
    expect(t.kind).toBe('settle');
  });
});

describe('transition: per-question checks', () => {
  const RIGHT = (run: RunRecord) => (run.state as { indices: number[] }).indices.map((i) => RIDDLE_POOL[i].answer);
  const checkBody = (index: number, answer: string) => ({ check: { index, answer } });

  it('answers the question with a checked result: the run stays active and nothing is finished', () => {
    const run = frozen(runFor('riddles'));
    const t = transition(run, SESSION, checkBody(0, RIGHT(run)[0]), T0 + 1000);
    expect(t.kind).toBe('checked');
    if (t.kind !== 'checked') return;
    expect(t.response).toEqual({ index: 0, correct: true, correctAnswer: RIGHT(run)[0] });
    expect(t.next).toMatchObject({ status: 'active', lastActionAt: T0 });
    expect(t.next.final).toBeUndefined();
    expect((t.next.state as { given: string[] }).given).toEqual([RIGHT(run)[0]]);
  });

  it('is not held up by the throttle, and does not move the clock the batch is timed from', () => {
    const run = runFor('riddles');
    // Right after the start, when a batch would be "Too fast" under the throttle.
    expect(statusOf(() => transition(run, SESSION, checkBody(0, RIGHT(run)[0]), T0 + 1))).toBeUndefined();
    const t = transition(run, SESSION, checkBody(0, RIGHT(run)[0]), T0 + 1);
    expect(t.kind === 'checked' && t.next.lastActionAt).toBe(T0);
  });

  it('a repeat check gives the stored reply and the run state is not changed by the other option', () => {
    const run = runFor('riddles');
    const wrong = RIDDLE_POOL[(run.state as { indices: number[] }).indices[0]].options.find((o) => o !== RIGHT(run)[0]) as string;
    const first = transition(run, SESSION, checkBody(0, wrong), T0 + 1000);
    if (first.kind !== 'checked') throw new Error('expected a check');
    const again = transition(first.next, SESSION, checkBody(0, RIGHT(run)[0]), T0 + 2000);
    expect(again).toMatchObject({ kind: 'checked', response: { correct: false } });
    if (again.kind === 'checked') expect((again.next.state as { given: string[] }).given).toEqual([wrong]);
  });

  it('an out-of-order check is 409', () => {
    const run = runFor('riddles');
    expect(statusOf(() => transition(run, SESSION, checkBody(1, RIGHT(run)[1]), T0 + 1000))).toBe(409);
  });

  it('a malformed check is 400 and does not change the run', () => {
    const run = frozen(runFor('riddles'));
    expect(statusOf(() => transition(run, SESSION, { check: { index: 0 } }, T0 + 1000))).toBe(400);
    expect(statusOf(() => transition(run, SESSION, checkBody(0, 'Not An Option'), T0 + 1000))).toBe(400);
  });

  it('a check for a trivia question works the same way', () => {
    const run = runFor('trivia');
    const answer = TRIVIA_POOL[(run.state as { indices: number[] }).indices[0]].answer;
    const t = transition(run, SESSION, checkBody(0, answer), T0 + 1000);
    expect(t).toMatchObject({ kind: 'checked', response: { index: 0, correct: true, correctAnswer: answer } });
  });

  it('a check for a memory run is 400', () => {
    expect(statusOf(() => transition(runFor('memory'), SESSION, checkBody(0, 'x'), T0 + 1000))).toBe(400);
  });

  it('a body with both a check and answers is 400', () => {
    const run = runFor('riddles');
    expect(statusOf(() => transition(run, SESSION, { ...checkBody(0, RIGHT(run)[0]), answers: [null, null, null, null, null] }, T0 + 1000))).toBe(400);
  });

  it('a check on a finished run is 409, settled or not', () => {
    const settled = runFor('riddles', { status: 'done', final: { score: 1, durationMs: 1, response: {}, settled: true } });
    const unsettled = runFor('riddles', { status: 'done', final: { score: 1, durationMs: 1, response: {}, settled: false } });
    expect(statusOf(() => transition(settled, SESSION, checkBody(0, 'x'), T0 + 9000))).toBe(409);
    expect(statusOf(() => transition(unsettled, SESSION, checkBody(0, 'x'), T0 + 9000))).toBe(409);
  });

  it('a check on an abandoned or expired run is 409', () => {
    const abandoned = runFor('riddles', { status: 'abandoned' });
    const expired = runFor('riddles', { expiresAt: T0 + 1000 });
    expect(statusOf(() => transition(abandoned, SESSION, checkBody(0, 'x'), T0 + 1000))).toBe(409);
    expect(statusOf(() => transition(expired, SESSION, checkBody(0, 'x'), T0 + 1000))).toBe(409);
  });

  it('a check from another session is 404', () => {
    expect(statusOf(() => transition(runFor('riddles'), 'other', checkBody(0, 'x'), T0 + 1000))).toBe(404);
  });

  it('the batch cannot skip its wait by checking first: checked answers count toward the 500ms per answer', () => {
    const base = runFor('riddles');
    const answers = RIGHT(base);
    let run: RunRecord = base;
    for (let i = 0; i < 5; i++) {
      const t = transition(run, SESSION, checkBody(i, answers[i]), T0 + 10);
      if (t.kind !== 'checked') throw new Error('expected a check');
      run = t.next;
    }
    // Five answers locked in, so the batch needs 2500ms since the start even though it sends nothing.
    expect(statusOf(() => transition(run, SESSION, { answers: [null, null, null, null, null] }, T0 + 2499))).toBe(429);
    expect(statusOf(() => transition(run, SESSION, { answers: [null, null, null, null, null] }, T0 + 2500))).toBeUndefined();
  });

  it('a batch after checks is graded with the locked-in answers and scores the run', () => {
    const base = runFor('riddles');
    const answers = RIGHT(base);
    const checked = transition(base, SESSION, checkBody(0, answers[0]), T0 + 100);
    if (checked.kind !== 'checked') throw new Error('expected a check');
    const t = transition(checked.next, SESSION, { answers: [null, null, null, null, null] }, T0 + 3000);
    expect(t).toMatchObject({ kind: 'applied', finished: true });
    if (t.kind !== 'applied') return;
    expect(t.next.final?.response.results).toEqual([
      { answered: true, correct: true, correctAnswer: answers[0] },
      { answered: false, correct: false, correctAnswer: answers[1] },
      { answered: false, correct: false, correctAnswer: answers[2] },
      { answered: false, correct: false, correctAnswer: answers[3] },
      { answered: false, correct: false, correctAnswer: answers[4] },
    ]);
    expect(t.next.final?.score).toBe(calcRunScore('riddles', 1 / 5, 3000));
  });
});
