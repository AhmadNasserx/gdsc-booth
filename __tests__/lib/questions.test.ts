import { MEMORY_EMOJIS } from '@/lib/memoryEmojis';
import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';

/** Largest share of answers that land on any single option index (0 to 3). */
function largestIndexShare(indexes: number[], total: number): number {
  const counts = [0, 0, 0, 0];
  for (const index of indexes) {
    if (index >= 0 && index < 4) counts[index] += 1;
  }
  return Math.max(...counts) / total;
}

describe('RIDDLE_POOL', () => {
  it('has at least 40 riddles', () => {
    expect(RIDDLE_POOL.length).toBeGreaterThanOrEqual(40);
  });

  it('has emojis, hint and answer on every riddle', () => {
    for (const r of RIDDLE_POOL) {
      expect(r.emojis.trim().length).toBeGreaterThan(0);
      expect(r.hint.trim().length).toBeGreaterThan(0);
      expect(r.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it('has four distinct options and the answer is one of them', () => {
    for (const r of RIDDLE_POOL) {
      expect(r.options).toHaveLength(4);
      expect(new Set(r.options).size).toBe(4);
      expect(r.options).toContain(r.answer);
    }
  });

  it('has no duplicate emoji prompts', () => {
    expect(new Set(RIDDLE_POOL.map((r) => r.emojis)).size).toBe(RIDDLE_POOL.length);
  });

  it('has no duplicate answers', () => {
    expect(new Set(RIDDLE_POOL.map((r) => r.answer)).size).toBe(RIDDLE_POOL.length);
  });

  it('spreads the correct answer across the four positions', () => {
    const indexes = RIDDLE_POOL.map((r) => r.options.indexOf(r.answer));
    expect(largestIndexShare(indexes, RIDDLE_POOL.length)).toBeLessThanOrEqual(0.4);
  });
});

describe('TRIVIA_POOL', () => {
  it('has at least 80 questions', () => {
    expect(TRIVIA_POOL.length).toBeGreaterThanOrEqual(80);
  });

  it('has non-empty question text', () => {
    for (const q of TRIVIA_POOL) {
      expect(q.question.trim().length).toBeGreaterThan(0);
    }
  });

  it('has four distinct options and the answer is one of them', () => {
    for (const q of TRIVIA_POOL) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    }
  });

  it('has no duplicate questions', () => {
    expect(new Set(TRIVIA_POOL.map((q) => q.question)).size).toBe(TRIVIA_POOL.length);
  });

  it('spreads the correct answer across the four positions', () => {
    const indexes = TRIVIA_POOL.map((q) => q.options.indexOf(q.answer));
    expect(largestIndexShare(indexes, TRIVIA_POOL.length)).toBeLessThanOrEqual(0.4);
  });
});

describe('MEMORY_EMOJIS', () => {
  it('has exactly 8 entries', () => {
    expect(MEMORY_EMOJIS).toHaveLength(8);
  });

  it('has distinct, non-empty entries', () => {
    for (const emoji of MEMORY_EMOJIS) {
      expect(typeof emoji).toBe('string');
      expect(emoji.length).toBeGreaterThan(0);
    }
    expect(new Set(MEMORY_EMOJIS).size).toBe(MEMORY_EMOJIS.length);
  });
});
