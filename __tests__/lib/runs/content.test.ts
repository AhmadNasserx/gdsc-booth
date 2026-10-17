/**
 * @jest-environment node
 */
import { contentKeys, CONTENT_COUNT, pickFresh, servedFrom, SEEN_TTL_MS } from '@/lib/runs/content';
import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const randomInt = (max: number) => Math.floor(Math.random() * max);

describe('contentKeys', () => {
  it('covers every entry of each pool', () => {
    expect(contentKeys('riddles')).toEqual(range(RIDDLE_POOL.length));
    expect(contentKeys('trivia')).toEqual(range(TRIVIA_POOL.length));
  });

  it('has pools large enough for the counts per start', () => {
    expect(RIDDLE_POOL.length).toBeGreaterThanOrEqual(CONTENT_COUNT.riddles);
    expect(TRIVIA_POOL.length).toBeGreaterThanOrEqual(CONTENT_COUNT.trivia);
  });
});

describe('servedFrom', () => {
  it('reads the served list while the record is live', () => {
    expect(servedFrom({ served: [1, 2], expiresAt: 100 }, 50)).toEqual([1, 2]);
  });

  it('treats an expired or missing record as nothing served', () => {
    expect(servedFrom({ served: [1, 2], expiresAt: 100 }, 100)).toEqual([]);
    expect(servedFrom(null, 0)).toEqual([]);
    expect(servedFrom({ expiresAt: 100 }, 50)).toEqual([]);
  });

  it('accepts the object form RTDB sometimes returns for lists', () => {
    expect(servedFrom({ served: { 0: 4, 1: 9 }, expiresAt: 100 }, 50)).toEqual([4, 9]);
  });
});

describe('pickFresh', () => {
  it('picks only unseen keys and adds them to the served list', () => {
    const keys = range(10);
    const { picked, served } = pickFresh(keys, [0, 1, 2], 4, randomInt);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    for (const k of picked) expect([0, 1, 2]).not.toContain(k);
    expect([...served].sort((a, b) => a - b)).toEqual([0, 1, 2, ...picked].sort((a, b) => a - b));
  });

  it('ignores served keys that are no longer in the pool', () => {
    const { served } = pickFresh(range(6), [1, 99], 2, randomInt);
    expect(served).not.toContain(99);
  });

  it('when fewer unseen keys remain than needed, takes them all, tops up from seen, and resets served to the new picks', () => {
    const keys = range(7);
    const { picked, served } = pickFresh(keys, [0, 1, 2, 3, 4, 5], 3, randomInt);
    // Key 6 is the only unseen one, so it must be in the picks
    expect(picked).toContain(6);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(served).toEqual(picked);
  });

  it('with nothing served, picks from the whole pool and records the picks', () => {
    const { picked, served } = pickFresh(range(20), [], 5, randomInt);
    expect(new Set(picked).size).toBe(5);
    expect(served).toEqual(expect.arrayContaining(picked));
    expect(served).toHaveLength(5);
  });

  it('refuses to pick more keys than the pool has', () => {
    expect(() => pickFresh(range(3), [], 4, randomInt)).toThrow();
  });

  it('draws without repeats until the pool is used up, then cycles', () => {
    const keys = range(7);
    let served: number[] = [];
    const draws: number[][] = [];
    for (let draw = 0; draw < 4; draw++) {
      const r = pickFresh(keys, served, 3, randomInt);
      draws.push(r.picked);
      served = r.served;
    }
    // Draws 1 and 2 use six different keys
    expect(new Set([...draws[0], ...draws[1]]).size).toBe(6);
    // Draw 3 has only one unseen key left, so it is reused from before. The served list resets to draw 3.
    expect(draws[2]).toContain(keys.find((k) => !draws[0].includes(k) && !draws[1].includes(k)));
    expect(new Set(draws[2]).size).toBe(3);
  });

  it('exhausts a full pool exactly and resets on the next draw', () => {
    const keys = range(10);
    const first = pickFresh(keys, [], 5, randomInt);
    const second = pickFresh(keys, first.served, 5, randomInt);
    expect(new Set([...first.picked, ...second.picked]).size).toBe(10);
    expect(second.served).toEqual(expect.arrayContaining(second.picked));
    const third = pickFresh(keys, second.served, 5, randomInt);
    expect(third.served).toEqual(third.picked);
    expect(new Set(third.picked).size).toBe(5);
  });
});

describe('SEEN_TTL_MS', () => {
  it('is 48 hours', () => {
    expect(SEEN_TTL_MS).toBe(48 * 60 * 60 * 1000);
  });
});
