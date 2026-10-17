import { calcRunScore, GAME_TIME_LIMIT, memoryPerformance } from '@/lib/scoring';
import { TABS } from '@/lib/types';

const SEC = 1000;

describe('calcRunScore', () => {
  it('gives no points at all when P is 0, however fast the run', () => {
    for (const game of TABS) {
      expect(calcRunScore(game, 0, 0)).toBe(0);
      expect(calcRunScore(game, 0, GAME_TIME_LIMIT[game] * SEC / 2)).toBe(0);
    }
  });

  it('gives the full speed bonus (250 * P) for an instant finish', () => {
    expect(calcRunScore('riddles', 1, 0)).toBe(1000 + 250);
    expect(calcRunScore('riddles', 0.5, 0)).toBe(500 + 125);
    expect(calcRunScore('memory', 0.4, 0)).toBe(400 + 100);
  });

  it('gives no speed bonus at or beyond the game time limit', () => {
    for (const game of TABS) {
      const limit = GAME_TIME_LIMIT[game] * SEC;
      expect(calcRunScore(game, 1, limit)).toBe(1000);
      expect(calcRunScore(game, 0.5, limit)).toBe(500);
      expect(calcRunScore(game, 1, limit * 3)).toBe(1000);
    }
  });

  it('gives half the speed bonus at half the time limit', () => {
    expect(calcRunScore('bugs', 1, (GAME_TIME_LIMIT.bugs / 2) * SEC)).toBe(1000 + 125);
  });

  it('uses the per-game time limits', () => {
    expect(GAME_TIME_LIMIT).toEqual({
      riddles: 90,
      bugs: 120,
      memory: 90,
    });
    // Bug Hunter's clock is 120s, so at 60s it still has half its bonus
    expect(calcRunScore('bugs', 1, 60 * SEC)).toBe(1000 + 125);
  });

  it('treats a negative duration as an instant finish', () => {
    expect(calcRunScore('riddles', 1, -5 * SEC)).toBe(calcRunScore('riddles', 1, 0));
  });

  it('gives no speed bonus when the duration is not a finite number', () => {
    expect(calcRunScore('riddles', 1, NaN)).toBe(1000);
    expect(calcRunScore('riddles', 1, Infinity)).toBe(1000);
  });

  it('treats a non-finite performance as zero and clamps performance to [0, 1]', () => {
    expect(calcRunScore('riddles', NaN, 0)).toBe(0);
    expect(calcRunScore('riddles', 2, 0)).toBe(calcRunScore('riddles', 1, 0));
    expect(calcRunScore('riddles', -1, 0)).toBe(0);
  });

  it('is non-decreasing in P and non-increasing in duration', () => {
    for (const game of TABS) {
      let previous = -1;
      for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const score = calcRunScore(game, p, 10 * SEC);
        expect(score).toBeGreaterThanOrEqual(previous);
        previous = score;
      }
      let slower = Infinity;
      for (const s of [0, 5, 30, 60, 120, 400]) {
        const score = calcRunScore(game, 0.8, s * SEC);
        expect(score).toBeLessThanOrEqual(slower);
        slower = score;
      }
    }
  });

  it('returns integers', () => {
    for (const game of TABS) {
      expect(Number.isInteger(calcRunScore(game, 0.37, 13.3 * SEC))).toBe(true);
    }
  });

  it('a finished run never scores below the performance points', () => {
    for (const game of TABS) {
      expect(calcRunScore(game, 0.6, 1000 * SEC)).toBe(600);
    }
  });
});

describe('memoryPerformance', () => {
  it('is full at 8 moves (one attempt per pair)', () => {
    expect(memoryPerformance(8)).toBe(1);
  });

  it('falls by 1/24 per extra move and reaches zero at 32 moves', () => {
    expect(memoryPerformance(9)).toBeCloseTo(23 / 24);
    expect(memoryPerformance(32)).toBe(0);
  });

  it('is clamped to [0, 1] outside the usual range', () => {
    expect(memoryPerformance(40)).toBe(0);
    expect(memoryPerformance(0)).toBe(1);
  });
});
