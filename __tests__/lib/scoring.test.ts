import {
  validateScores,
  calcTotal,
  calcPasswordScore,
  VALID_RIDDLE_SCORES,
  VALID_BINARY_SCORES,
} from '@/lib/scoring';
import type { Tab } from '@/lib/types';

const valid = { riddles: 120, trivia: 60, binary: 150, password: 150, wordle: 200 };

describe('validateScores', () => {
  it('accepts valid score set', () => {
    expect(validateScores(valid)).toBe(true);
  });

  it('rejects riddle score not in valid set', () => {
    expect(validateScores({ ...valid, riddles: 25 })).toBe(false);
    expect(validateScores({ ...valid, riddles: 201 })).toBe(false);
    expect(validateScores({ ...valid, riddles: 50.5 })).toBe(false);
  });

  it('rejects trivia score out of [0,300]', () => {
    expect(validateScores({ ...valid, trivia: 301 })).toBe(false);
    expect(validateScores({ ...valid, trivia: -1 })).toBe(false);
    expect(validateScores({ ...valid, trivia: 1.5 })).toBe(false);
  });

  it('rejects binary score not 0 or 150', () => {
    expect(validateScores({ ...valid, binary: 100 })).toBe(false);
    expect(validateScores({ ...valid, binary: 1 })).toBe(false);
  });

  it('rejects password score out of [0,200]', () => {
    expect(validateScores({ ...valid, password: 201 })).toBe(false);
    expect(validateScores({ ...valid, password: -1 })).toBe(false);
  });
});

describe('calcTotal', () => {
  it('sums all five scores', () => {
    expect(calcTotal({ riddles: 200, trivia: 300, binary: 150, password: 200, wordle: 300 })).toBe(1150);
    expect(calcTotal({ riddles: 0, trivia: 0, binary: 0, password: 0, wordle: 0 })).toBe(0);
  });
});

describe('calcPasswordScore', () => {
  it('returns 0 for empty string', () => {
    expect(calcPasswordScore('')).toBe(0);
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
    const withPattern    = calcPasswordScore('Abcdefgh1!');
    const withoutPattern = calcPasswordScore('Axkrmvph1!');
    expect(withPattern).toBeLessThan(withoutPattern);
  });

  it('caps at 200', () => {
    // 28 unique chars: all types, no repeats, no patterns
    expect(calcPasswordScore('Xk9#mRv!LqT7@wNbZcQdEfHpJsAi')).toBe(200);
  });
});
