import {
  calcMemoryScore,
  calcPasswordScore,
  calcWordleScore,
  isPlausibleMemory,
  normalizeScore,
  LEADERBOARD_MAX,
} from '@/lib/scoring';
import { GAMES } from '@/lib/games';
import { TABS } from '@/lib/types';

describe('LEADERBOARD_MAX', () => {
  it('is 1000', () => {
    expect(LEADERBOARD_MAX).toBe(1000);
  });
});

describe('normalizeScore', () => {
  it('maps each game max raw score to LEADERBOARD_MAX', () => {
    for (const tab of TABS) {
      expect(normalizeScore(tab, GAMES[tab].maxRaw)).toBe(1000);
    }
  });

  it('maps zero to zero', () => {
    for (const tab of TABS) {
      expect(normalizeScore(tab, 0)).toBe(0);
    }
  });

  it('scales proportionally and rounds', () => {
    expect(normalizeScore('riddles', 100)).toBe(500); // 100 / 200
    expect(normalizeScore('trivia', 100)).toBe(333);  // 100 / 300 = 333.3
    expect(normalizeScore('trivia', 200)).toBe(667);  // 200 / 300 = 666.7
  });

  it('clamps raw scores above the game max', () => {
    expect(normalizeScore('bugs', 9999)).toBe(1000);
  });

  it('clamps negative raw scores to zero', () => {
    expect(normalizeScore('trivia', -50)).toBe(0);
  });

  it('treats NaN as zero', () => {
    expect(normalizeScore('wordle', NaN)).toBe(0);
  });

  it('always stays within 0..1000 for every game', () => {
    for (const tab of TABS) {
      for (const raw of [-1, 0, 1, 37, GAMES[tab].maxRaw / 2, GAMES[tab].maxRaw, GAMES[tab].maxRaw * 3]) {
        const v = normalizeScore(tab, raw);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1000);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});

describe('calcWordleScore', () => {
  it('scores 0 when unsolved', () => {
    expect(calcWordleScore(6, false)).toBe(0);
  });

  it('gives 300 for a first-guess solve and 50 for a sixth-guess solve', () => {
    expect(calcWordleScore(1, true)).toBe(300);
    expect(calcWordleScore(6, true)).toBe(50);
  });
});

describe('calcMemoryScore', () => {
  it('gives the full 1000 for 8 moves in 20 seconds or less', () => {
    expect(calcMemoryScore(8, 20)).toBe(1000);
    expect(calcMemoryScore(8, 6)).toBe(1000);
  });

  it('deducts 25 per extra move', () => {
    expect(calcMemoryScore(9, 15)).toBe(975);
    expect(calcMemoryScore(12, 15)).toBe(900);
  });

  it('deducts 5 per second beyond 20', () => {
    expect(calcMemoryScore(8, 30)).toBe(950);
    expect(calcMemoryScore(8, 21)).toBe(995);
  });

  it('combines move and time penalties', () => {
    expect(calcMemoryScore(10, 40)).toBe(1000 - 50 - 100);
  });

  it('clamps to 0 for very slow, inefficient games', () => {
    expect(calcMemoryScore(200, 3600)).toBe(0);
  });

  it('returns integers', () => {
    expect(Number.isInteger(calcMemoryScore(9, 33))).toBe(true);
  });
});

describe('isPlausibleMemory', () => {
  it('accepts realistic results', () => {
    expect(isPlausibleMemory(8, 6)).toBe(true);
    expect(isPlausibleMemory(200, 3600)).toBe(true);
    expect(isPlausibleMemory(14, 90)).toBe(true);
  });

  it('rejects moves below the 8 needed for 8 pairs', () => {
    expect(isPlausibleMemory(7, 30)).toBe(false);
    expect(isPlausibleMemory(0, 30)).toBe(false);
  });

  it('rejects moves above 200', () => {
    expect(isPlausibleMemory(201, 30)).toBe(false);
  });

  it('rejects implausibly fast times', () => {
    expect(isPlausibleMemory(8, 5)).toBe(false);
    expect(isPlausibleMemory(8, 0)).toBe(false);
  });

  it('rejects times above one hour', () => {
    expect(isPlausibleMemory(8, 3601)).toBe(false);
  });

  it('rejects non-integers and non-numbers', () => {
    expect(isPlausibleMemory(8.5, 30)).toBe(false);
    expect(isPlausibleMemory(8, 30.2)).toBe(false);
    expect(isPlausibleMemory('8', 30)).toBe(false);
    expect(isPlausibleMemory(8, '30')).toBe(false);
    expect(isPlausibleMemory(undefined, 30)).toBe(false);
    expect(isPlausibleMemory(8, null)).toBe(false);
    expect(isPlausibleMemory(NaN, 30)).toBe(false);
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
