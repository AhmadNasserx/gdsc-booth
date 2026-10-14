import {
  calcPasswordScore,
  calcRunScore,
  calcWordleScore,
  GAME_TIME_LIMIT,
  memoryPerformance,
  passwordPerformance,
  passwordStrengthLabel,
  triviaPerformance,
  triviaStep,
  wordlePerformance,
} from '@/lib/scoring';
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
      trivia: 240,
      bugs: 120,
      wordle: 180,
      memory: 90,
      password: 90,
    });
    // Trivia's clock is 240s, so at 120s it still has half its bonus
    expect(calcRunScore('trivia', 1, 120 * SEC)).toBe(1000 + 125);
  });

  it('treats a negative duration as an instant finish', () => {
    expect(calcRunScore('wordle', 1, -5 * SEC)).toBe(calcRunScore('wordle', 1, 0));
  });

  it('gives no speed bonus when the duration is not a finite number', () => {
    expect(calcRunScore('wordle', 1, NaN)).toBe(1000);
    expect(calcRunScore('wordle', 1, Infinity)).toBe(1000);
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

describe('trivia points', () => {
  it('adds 20 for a right answer and takes 10 for a wrong one', () => {
    expect(triviaStep(0, true)).toBe(20);
    expect(triviaStep(100, true)).toBe(120);
    expect(triviaStep(100, false)).toBe(90);
  });

  it('never goes below zero', () => {
    expect(triviaStep(0, false)).toBe(0);
    expect(triviaStep(5, false)).toBe(0);
  });

  it('maps points to performance, clamped to [0, 1]', () => {
    expect(triviaPerformance(0)).toBe(0);
    expect(triviaPerformance(150)).toBe(0.5);
    expect(triviaPerformance(300)).toBe(1);
    expect(triviaPerformance(420)).toBe(1);
  });

  it('a run of 15 right answers reaches full performance, and wrong answers in between cost points', () => {
    let points = 0;
    for (let i = 0; i < 15; i++) points = triviaStep(points, true);
    expect(triviaPerformance(points)).toBe(1);

    let mixed = 0;
    const answers = [true, false, true, true, false];
    for (const correct of answers) mixed = triviaStep(mixed, correct);
    expect(mixed).toBe(20 - 10 + 20 + 20 - 10);
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

describe('calcWordleScore and wordlePerformance', () => {
  it('scores 0 when the word was not found', () => {
    expect(calcWordleScore(6, false)).toBe(0);
    expect(wordlePerformance(6, false)).toBe(0);
  });

  it('gives 300 for a first-guess solve and 50 for a sixth-guess solve', () => {
    expect(calcWordleScore(1, true)).toBe(300);
    expect(calcWordleScore(6, true)).toBe(50);
    expect(wordlePerformance(1, true)).toBe(1);
  });

  it('steps down with every guess', () => {
    const values = [1, 2, 3, 4, 5, 6].map((g) => calcWordleScore(g, true));
    expect(values).toEqual([300, 250, 200, 150, 100, 50]);
  });
});

describe('calcPasswordScore', () => {
  it('returns 0 for empty string', () => {
    expect(calcPasswordScore('')).toBe(0);
  });

  it('gives no length points below 8 characters', () => {
    expect(calcPasswordScore('Ab1!')).toBeLessThan(calcPasswordScore('Ab1!xyzq'));
  });

  it('penalises repeated characters (pattern penalty + low uniqueness)', () => {
    expect(calcPasswordScore('aaaaaaaa')).toBeLessThan(10);
  });

  it('scores a genuine 8-char strong password above 140', () => {
    expect(calcPasswordScore('Xk7@mPv!')).toBeGreaterThan(140);
  });

  it('returns 200 for an excellent 24-char password', () => {
    expect(calcPasswordScore('XkP9#mRv2!LqT7@wNbZcQdEf')).toBe(200);
  });

  it('applies pattern penalty for common sequences', () => {
    const withPattern = calcPasswordScore('Abcdefgh1!');
    const withoutPattern = calcPasswordScore('Axkrmvph1!');
    expect(withPattern).toBeLessThan(withoutPattern);
  });

  it('caps at 200', () => {
    // 28 unique chars: all types, no repeats, no patterns
    expect(calcPasswordScore('Xk9#mRv!LqT7@wNbZcQdEfHpJsAi')).toBe(200);
  });

  it('passwordPerformance is the strength over the cap', () => {
    expect(passwordPerformance('XkP9#mRv2!LqT7@wNbZcQdEf')).toBe(1);
    expect(passwordPerformance('')).toBe(0);
  });

  it('labels strength bands', () => {
    expect(passwordStrengthLabel(200)).toBe('Excellent 🔥');
    expect(passwordStrengthLabel(0)).toBe('Weak 😬');
  });
});
