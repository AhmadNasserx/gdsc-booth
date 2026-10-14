/**
 * @jest-environment node
 */
import { transition } from '@/lib/runs/transition';
import { RunError, type RunRecord } from '@/lib/runs/shared';
import { startGame } from '@/lib/runs';
import { calcRunScore } from '@/lib/scoring';

const T0 = 1_700_000_000_000;
const SESSION = 'session-1';

function runFor(game: 'riddles' | 'password' | 'memory' | 'wordle', overrides: Partial<RunRecord> = {}): RunRecord {
  const { state } = startGame(game, () => 0);
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
    expect(statusOf(() => transition(runFor('password'), 'other', { password: 'x' }, T0 + 1000))).toBe(404);
  });

  it('409 for a replaced run', () => {
    const run = runFor('password', { status: 'abandoned' });
    expect(statusOf(() => transition(run, SESSION, { password: 'x' }, T0 + 1000))).toBe(409);
  });

  it('409 for a finished run whose leaderboard entry is settled', () => {
    const run = runFor('password', { status: 'done', final: { score: 1, durationMs: 1, response: {}, settled: true } });
    expect(statusOf(() => transition(run, SESSION, { password: 'x' }, T0 + 1000))).toBe(409);
  });

  it('a finished run that is not yet settled is handed back for settling', () => {
    const run = runFor('password', { status: 'done', final: { score: 1, durationMs: 1, response: {}, settled: false } });
    const t = transition(run, SESSION, { password: 'x' }, T0 + 1000);
    expect(t.kind).toBe('settle');
  });

  it('409 once the run has passed its expiry', () => {
    const run = runFor('password', { expiresAt: T0 + 1000 });
    expect(statusOf(() => transition(run, SESSION, { password: 'x' }, T0 + 1000))).toBe(409);
  });

  it('429 inside the throttle window and allowed at exactly the window', () => {
    const run = runFor('riddles');
    expect(statusOf(() => transition(run, SESSION, { answer: '' }, T0 + 299))).toBe(429);
    expect(statusOf(() => transition(run, SESSION, { answer: '' }, T0 + 300))).toBeUndefined();
  });

  it('memory uses the 120ms window', () => {
    const run = runFor('memory');
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 119))).toBe(429);
    expect(statusOf(() => transition(run, SESSION, { flip: 0 }, T0 + 120))).toBeUndefined();
  });

  it('a rejected body is a 400 and leaves the run untouched', () => {
    const run = frozen(runFor('riddles'));
    expect(statusOf(() => transition(run, SESSION, { flip: 1 }, T0 + 1000))).toBe(400);
  });
});

describe('transition: applying actions', () => {
  it('moves lastActionAt to now and keeps the run active while the game goes on', () => {
    const run = frozen(runFor('riddles'));
    const t = transition(run, SESSION, { answer: '' }, T0 + 1000);
    expect(t).toMatchObject({ kind: 'applied', finished: false, next: { status: 'active', lastActionAt: T0 + 1000 } });
    expect(run.lastActionAt).toBe(T0);
  });

  it('a finishing action marks the run done and stores the score for the elapsed time', () => {
    const run = runFor('password');
    const now = T0 + 12_000;
    const t = transition(run, SESSION, { password: 'XkP9#mRv2!LqT7@wNbZcQdEf' }, now);
    expect(t.kind).toBe('applied');
    if (t.kind !== 'applied') return;
    expect(t.finished).toBe(true);
    expect(t.next.status).toBe('done');
    expect(t.next.final).toEqual({
      score: calcRunScore('password', 1, 12_000),
      durationMs: 12_000,
      response: { score: 200 },
      settled: false,
    });
  });

  it('measures the duration from the start of the run, not from the last action', () => {
    const run = runFor('password', { lastActionAt: T0 + 5000 });
    const t = transition(run, SESSION, { password: 'x' }, T0 + 6000);
    expect(t.kind === 'applied' && t.next.final?.durationMs).toBe(6000);
  });

  it('a clock that reads before the last action counts as too fast rather than going negative', () => {
    const run = runFor('password', { lastActionAt: T0 + 1000 });
    expect(statusOf(() => transition(run, SESSION, { password: 'x' }, T0 + 500))).toBe(429);
  });

  it('a riddles answer in the middle of a game does not finish it', () => {
    const t = transition(runFor('riddles'), SESSION, { answer: '' }, T0 + 1000);
    expect(t.kind === 'applied' && t.next.final).toBeUndefined();
  });
});
