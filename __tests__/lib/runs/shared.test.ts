/**
 * @jest-environment node
 */
import { expectQuestion, listOf, minIntervalMs, numberOf, pickIndices, requiredQuestionIndex, RunError, shuffle, toStorable } from '@/lib/runs/shared';

describe('shuffle and pickIndices', () => {
  it('keeps every element', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect([...shuffle(items)].sort()).toEqual(items);
  });

  it('does not change the input', () => {
    const items = [1, 2, 3];
    shuffle(items);
    expect(items).toEqual([1, 2, 3]);
  });

  it('uses the supplied random source', () => {
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });

  it('picks distinct indices in range', () => {
    const picked = pickIndices(20, 5);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
    expect(picked.every((i) => i >= 0 && i < 20)).toBe(true);
  });
});

describe('RunError', () => {
  it('carries its status and message', () => {
    const err = new RunError(429, 'Too fast');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(429);
    expect(err.message).toBe('Too fast');
  });
});

describe('minIntervalMs', () => {
  it('is 120ms for memory and 300ms for the rest', () => {
    expect(minIntervalMs('memory')).toBe(120);
    for (const game of ['riddles', 'trivia', 'bugs', 'wordle', 'password'] as const) {
      expect(minIntervalMs(game)).toBe(300);
    }
  });
});

describe('toStorable', () => {
  it('drops undefined keys so the write is accepted', () => {
    expect(toStorable({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(Object.keys(toStorable({ a: undefined }))).toEqual([]);
  });
});

describe('listOf and numberOf', () => {
  it('reads arrays, sparse objects, and missing values', () => {
    expect(listOf<number>([1, 2])).toEqual([1, 2]);
    expect(listOf<number>({ 0: 5, 2: 7 })).toEqual([5, 7]);
    expect(listOf<number>(undefined)).toEqual([]);
    expect(listOf<number>(null)).toEqual([]);
  });

  it('falls back for non-numbers', () => {
    expect(numberOf(4)).toBe(4);
    expect(numberOf(undefined)).toBe(0);
    expect(numberOf(NaN, -1)).toBe(-1);
  });
});

describe('question order', () => {
  it('requires a non-negative integer q', () => {
    expect(requiredQuestionIndex({ q: 3 })).toBe(3);
    expect(requiredQuestionIndex({ q: 0 })).toBe(0);
    expect(() => requiredQuestionIndex({})).toThrow(RunError);
    expect(() => requiredQuestionIndex({ q: '1' })).toThrow(RunError);
    expect(() => requiredQuestionIndex({ q: -1 })).toThrow(RunError);
    expect(() => requiredQuestionIndex({ q: 1.5 })).toThrow(RunError);
  });

  it('accepts the expected question and refuses any other', () => {
    expect(() => expectQuestion(4, 4)).not.toThrow();
    expect(() => expectQuestion(3, 4)).toThrow(RunError);
  });
});
