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

  it('awards 25 for length >= 8', () => {
    expect(calcPasswordScore('aaaaaaaa')).toBe(25);
  });

  it('awards 50 for length >= 12 (includes length>=8 bonus)', () => {
    expect(calcPasswordScore('aaaaaaaaaaaa')).toBe(50);
  });

  it('awards max 100 for strong password', () => {
    expect(calcPasswordScore('MyP@ssw0rd123!')).toBe(100);
  });

  it('caps at 100', () => {
    expect(calcPasswordScore('Aa0!aaaaaaaaaaaa')).toBe(100);
  });
});
