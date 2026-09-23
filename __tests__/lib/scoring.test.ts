import {
  validateScores,
  calcTotal,
  calcPasswordScore,
  VALID_RIDDLE_SCORES,
  VALID_BINARY_SCORES,
} from '@/lib/scoring';
import type { Tab } from '@/lib/types';

const valid = { riddles: 75, trivia: 50, binary: 100, password: 80 };

describe('validateScores', () => {
  it('accepts valid score set', () => {
    expect(validateScores(valid)).toBe(true);
  });

  it('rejects riddle score not in valid set', () => {
    expect(validateScores({ ...valid, riddles: 10 })).toBe(false);
    expect(validateScores({ ...valid, riddles: 101 })).toBe(false);
    expect(validateScores({ ...valid, riddles: 50.5 })).toBe(false);
  });

  it('rejects trivia score out of [0,99]', () => {
    expect(validateScores({ ...valid, trivia: 100 })).toBe(false);
    expect(validateScores({ ...valid, trivia: -1 })).toBe(false);
    expect(validateScores({ ...valid, trivia: 1.5 })).toBe(false);
  });

  it('rejects binary score not 0 or 100', () => {
    expect(validateScores({ ...valid, binary: 50 })).toBe(false);
    expect(validateScores({ ...valid, binary: 1 })).toBe(false);
  });

  it('rejects password score out of [0,100]', () => {
    expect(validateScores({ ...valid, password: 101 })).toBe(false);
    expect(validateScores({ ...valid, password: -1 })).toBe(false);
  });
});

describe('calcTotal', () => {
  it('sums all four scores', () => {
    expect(calcTotal({ riddles: 100, trivia: 99, binary: 100, password: 100 })).toBe(399);
    expect(calcTotal({ riddles: 0, trivia: 0, binary: 0, password: 0 })).toBe(0);
  });
});

describe('calcPasswordScore', () => {
  it('returns 0 for empty string', () => {
    expect(calcPasswordScore('')).toBe(0);
  });

  it('penalises repeated characters (pattern penalty + low uniqueness)', () => {
    // 'aaaaaaaa': triggers (.)\1{2,} pattern and has 1 unique char
    expect(calcPasswordScore('aaaaaaaa')).toBeLessThan(10);
  });

  it('scores a genuine 8-char strong password above 75', () => {
    // all char types, all unique, no patterns
    expect(calcPasswordScore('Xk7@mPv!')).toBeGreaterThan(75);
  });

  it('returns 100 for an excellent 18-char password', () => {
    // 18 chars, all types, all unique, no patterns
    expect(calcPasswordScore('XkP9#mRv2!LqT7@wNb')).toBe(100);
  });

  it('applies pattern penalty for common sequences', () => {
    // 'bcd' triggers the abc/bcd pattern; otherwise identical char types and length
    const withPattern    = calcPasswordScore('Abcdefgh1!');
    const withoutPattern = calcPasswordScore('Axkrmvph1!');
    expect(withPattern).toBeLessThan(withoutPattern);
  });

  it('caps at 100', () => {
    expect(calcPasswordScore('XkP9#mRv2!LqT7@wNbZcQdEf')).toBe(100);
  });
});
