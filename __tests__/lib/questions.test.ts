import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';

describe('RIDDLE_POOL', () => {
  it('stays populated', () => {
    expect(RIDDLE_POOL.length).toBeGreaterThanOrEqual(5);
  });
});

describe('TRIVIA_POOL', () => {
  it('has at least 15 questions, so one run can be served', () => {
    expect(TRIVIA_POOL.length).toBeGreaterThanOrEqual(15);
  });

  it('has four options per question and the answer is one of them', () => {
    for (const q of TRIVIA_POOL) {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.answer);
    }
  });

  it('has no duplicate options within a question and no empty text', () => {
    for (const q of TRIVIA_POOL) {
      expect(q.question.trim().length).toBeGreaterThan(0);
      expect(new Set(q.options).size).toBe(q.options.length);
    }
  });

  it('has unique questions', () => {
    expect(new Set(TRIVIA_POOL.map((q) => q.question)).size).toBe(TRIVIA_POOL.length);
  });
});
