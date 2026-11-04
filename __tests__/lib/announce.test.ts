import { hourWinners, reelNames, topFinishers } from '@/lib/announce';
import type { LeaderboardEntry } from '@/lib/types';

function entry(name: string, score: number, timestamp: number, finished = true): LeaderboardEntry {
  return { name, score, timestamp, expiresAt: 9e15, ...(finished ? { finishedAt: timestamp } : {}) };
}

describe('topFinishers', () => {
  it('ranks only players who finished all three games, best first', () => {
    const winners = topFinishers([entry('A', 100, 1), entry('B', 300, 2, false), entry('C', 200, 3)], 9);
    expect(winners).toEqual([
      { rank: 1, name: 'C', score: 200 },
      { rank: 2, name: 'A', score: 100 },
    ]);
  });

  it('breaks a tie in favour of whoever reached the total first', () => {
    const winners = topFinishers([entry('Late', 500, 20), entry('Early', 500, 10)], 2);
    expect(winners.map((w) => w.name)).toEqual(['Early', 'Late']);
  });

  it('stops at the requested count', () => {
    const many = Array.from({ length: 12 }, (_, i) => entry(`P${i}`, 1000 - i, i));
    expect(topFinishers(many, 9)).toHaveLength(9);
    expect(topFinishers(many, 9)[8]).toEqual({ rank: 9, name: 'P8', score: 992 });
  });
});

describe('hourWinners', () => {
  it('returns the hour top 3 in rank order', () => {
    const round = { round: 2, start: 0, end: 1, top: [{ name: 'B', score: 5, rank: 2 }, { name: 'A', score: 9, rank: 1 }] };
    expect(hourWinners(round)).toEqual([
      { rank: 1, name: 'A', score: 9 },
      { rank: 2, name: 'B', score: 5 },
    ]);
  });
});

describe('reelNames', () => {
  it('lists each name once', () => {
    expect(reelNames([entry('A', 1, 1), entry('A', 2, 2), entry('B', 1, 1)])).toEqual(['A', 'B']);
  });
});

describe('topFinishers since a time', () => {
  it('counts only players who finished at or after that time', () => {
    const winners = topFinishers([entry('Early', 900, 10), entry('Late', 500, 50), entry('Edge', 400, 30)], 9, 30);
    expect(winners.map((w) => w.name)).toEqual(['Late', 'Edge']);
  });
});
