/**
 * @jest-environment node
 */
import {
  currentRound,
  ensureEventStarted,
  msUntilRoundEnd,
  readEventStart,
  ROUND_MS,
  roundIndex,
  roundWindow,
  topOfRound,
} from '@/lib/event';
import { readPath, resetDb, simulateCacheMisses, writePath } from '@/test/support/rtdbMock';
import type { LeaderboardEntry } from '@/lib/types';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

const START = 1_700_000_000_000;

beforeEach(() => {
  resetDb();
});

afterEach(() => {
  simulateCacheMisses(false);
});

/** A player who finished all three games at `finishedAt`. */
function finished(name: string, score: number, timestamp: number, finishedAt: number): LeaderboardEntry {
  return {
    name,
    score,
    games: { riddles: score, memory: 0, trivia: 0 },
    timestamp,
    finishedAt,
    expiresAt: START + 10 * ROUND_MS,
  };
}

describe('roundIndex', () => {
  it('is 0 before the event starts', () => {
    expect(roundIndex(START, START - 1)).toBe(0);
  });

  it('is 1 exactly at the start', () => {
    expect(roundIndex(START, START)).toBe(1);
  });

  it('is 1 one millisecond before the first boundary', () => {
    expect(roundIndex(START, START + ROUND_MS - 1)).toBe(1);
  });

  it('is 2 exactly at the first boundary', () => {
    expect(roundIndex(START, START + ROUND_MS)).toBe(2);
  });

  it('is 3 two hours in', () => {
    expect(roundIndex(START, START + 2 * ROUND_MS)).toBe(3);
  });
});

describe('roundWindow', () => {
  it('gives hour 1 as the first hour from the start', () => {
    expect(roundWindow(START, 1)).toEqual({ start: START, end: START + ROUND_MS });
  });

  it('gives hour 3 as the third hour from the start', () => {
    expect(roundWindow(START, 3)).toEqual({ start: START + 2 * ROUND_MS, end: START + 3 * ROUND_MS });
  });

  it('ends exactly where the next hour starts', () => {
    expect(roundWindow(START, 1).end).toBe(roundWindow(START, 2).start);
    expect(roundWindow(START, 3).end).toBe(roundWindow(START, 4).start);
  });
});

describe('currentRound', () => {
  it('is null when the event has not started', () => {
    expect(currentRound(null, START)).toBeNull();
  });

  it('is 1 at the start', () => {
    expect(currentRound(START, START)).toBe(1);
  });

  it('is 1 before the start', () => {
    expect(currentRound(START, START - ROUND_MS)).toBe(1);
  });

  it('is 2 exactly at the first boundary', () => {
    expect(currentRound(START, START + ROUND_MS)).toBe(2);
  });
});

describe('msUntilRoundEnd', () => {
  it('is null when the event has not started', () => {
    expect(msUntilRoundEnd(null, START)).toBeNull();
  });

  it('is a full hour exactly at the start', () => {
    expect(msUntilRoundEnd(START, START)).toBe(ROUND_MS);
  });

  it('is 1 one millisecond before the first boundary', () => {
    expect(msUntilRoundEnd(START, START + ROUND_MS - 1)).toBe(1);
  });

  it('is a full hour again exactly at the first boundary, when hour 2 has just started', () => {
    expect(msUntilRoundEnd(START, START + ROUND_MS)).toBe(ROUND_MS);
  });

  it('is never negative', () => {
    for (let t = START - ROUND_MS; t <= START + 3 * ROUND_MS; t += 997) {
      const left = msUntilRoundEnd(START, t);
      expect(left).not.toBeNull();
      expect(left as number).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('topOfRound', () => {
  it('ranks by score, then earlier timestamp, then earlier finishedAt, then name', () => {
    const entries = [
      finished('Cara', 900, 50, START + 300),
      finished('Bilal', 900, 40, START + 400), // same score, earlier timestamp than Cara
      finished('Dana', 900, 40, START + 200), // same score and timestamp as Bilal, earlier finishedAt
      finished('Eli', 900, 40, START + 200), // same score, timestamp and finishedAt as Dana, later by name
    ];
    expect(topOfRound(entries, START, 1, 10).map((t) => t.name)).toEqual(['Dana', 'Eli', 'Bilal', 'Cara']);
  });

  it('leaves out players without finishedAt or missing one of the three games', () => {
    const notFinished: LeaderboardEntry = { ...finished('Still', 9999, 1, START + 100), finishedAt: undefined };
    const missingTrivia: LeaderboardEntry = {
      name: 'Partial',
      score: 8000,
      games: { riddles: 4000, memory: 4000 },
      timestamp: 1,
      finishedAt: START + 100,
      expiresAt: START + 10 * ROUND_MS,
    };
    const done = finished('Done', 100, 2, START + 100);
    expect(topOfRound([notFinished, missingTrivia, done], START, 1)).toEqual([{ name: 'Done', score: 100, rank: 1 }]);
  });

  it('puts a finish one millisecond before the boundary in hour 1, and one exactly on it in hour 2', () => {
    const before = finished('Early', 500, 1, START + ROUND_MS - 1);
    const after = finished('Late', 500, 1, START + ROUND_MS);
    expect(topOfRound([before, after], START, 1).map((t) => t.name)).toEqual(['Early']);
    expect(topOfRound([before, after], START, 2).map((t) => t.name)).toEqual(['Late']);
  });

  it('returns the top 3 by default, and fewer when there are fewer finishers', () => {
    const entries = [1, 2, 3, 4].map((i) => finished(`P${i}`, i * 100, i, START + 10 + i));
    expect(topOfRound(entries, START, 1)).toEqual([
      { name: 'P4', score: 400, rank: 1 },
      { name: 'P3', score: 300, rank: 2 },
      { name: 'P2', score: 200, rank: 3 },
    ]);
    expect(topOfRound(entries.slice(0, 2), START, 1)).toHaveLength(2);
    expect(topOfRound([], START, 1)).toEqual([]);
  });

  it('numbers the ranks 1, 2 and 3', () => {
    const entries = [finished('A', 300, 1, START + 1), finished('B', 200, 1, START + 2), finished('C', 100, 1, START + 3)];
    expect(topOfRound(entries, START, 1).map((t) => t.rank)).toEqual([1, 2, 3]);
  });
});

describe('readEventStart', () => {
  it('reads null when nothing is stored', async () => {
    expect(await readEventStart()).toEqual({ startedAt: null });
  });

  it('reads the stored start', async () => {
    writePath('event/startedAt', 1234);
    expect(await readEventStart()).toEqual({ startedAt: 1234 });
  });
});

describe('ensureEventStarted', () => {
  it('stores now on the first call and returns it', async () => {
    expect(await ensureEventStarted(START)).toBe(START);
    expect(readPath('event/startedAt')).toBe(START);
  });

  it('keeps the first value on a later call', async () => {
    await ensureEventStarted(START);
    expect(await ensureEventStarted(START + 5 * ROUND_MS)).toBe(START);
    expect(readPath('event/startedAt')).toBe(START);
  });

  it('keeps the first value when the cache shows an empty node', async () => {
    simulateCacheMisses(true);
    await ensureEventStarted(START);
    expect(await ensureEventStarted(START + 5 * ROUND_MS)).toBe(START);
    expect(readPath('event/startedAt')).toBe(START);
  });
});
