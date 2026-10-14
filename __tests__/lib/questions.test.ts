import { BUG_POOL, RIDDLE_POOL, TRIVIA_POOL, WORDLE_POOL } from '@/lib/questions';

describe('BUG_POOL', () => {
  it('has at least 14 snippets', () => {
    expect(BUG_POOL.length).toBeGreaterThanOrEqual(14);
  });

  it('has 5-8 lines per snippet', () => {
    for (const q of BUG_POOL) {
      expect(q.lines.length).toBeGreaterThanOrEqual(5);
      expect(q.lines.length).toBeLessThanOrEqual(8);
    }
  });

  it('has an integer answer that points at a line in range', () => {
    for (const q of BUG_POOL) {
      expect(Number.isInteger(q.answer)).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.lines.length);
    }
  });

  it('has non-empty title, language and explanation', () => {
    for (const q of BUG_POOL) {
      expect(q.title.trim().length).toBeGreaterThan(0);
      expect(q.language.trim().length).toBeGreaterThan(0);
      expect(q.explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it('spreads correct answers across different line positions', () => {
    const positions = new Set(BUG_POOL.map((q) => q.answer));
    expect(positions.size).toBeGreaterThanOrEqual(4);
  });

  it('has unique titles', () => {
    const titles = new Set(BUG_POOL.map((q) => q.title));
    expect(titles.size).toBe(BUG_POOL.length);
  });
});

describe('other question pools', () => {
  it('keeps the riddle, trivia and wordle pools populated', () => {
    expect(RIDDLE_POOL.length).toBeGreaterThanOrEqual(5);
    expect(TRIVIA_POOL.length).toBeGreaterThanOrEqual(15);
    expect(WORDLE_POOL.length).toBeGreaterThan(0);
  });
});
