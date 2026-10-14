/**
 * @jest-environment node
 */
import { applyMemoryFlip, hydrateMemory, MEMORY_CARDS, parseMemoryAction, startMemory, type MemoryState } from '@/lib/runs/memory';
import { memoryPerformance } from '@/lib/scoring';
import { RunError } from '@/lib/runs/shared';

/** A known board: pairs at (0,1) (2,3) ... (14,15). */
const BOARD = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e', 'f', 'f', 'g', 'g', 'h', 'h'];
const FRESH: MemoryState = { layout: BOARD, matched: BOARD.map(() => false), open: -1, moves: 0 };

describe('startMemory', () => {
  it('deals 16 cards, each of 8 faces exactly twice, and reveals only the card count', () => {
    const { state, view } = startMemory();
    expect(view).toEqual({ game: 'memory', cards: MEMORY_CARDS });
    expect(MEMORY_CARDS).toBe(16);
    const counts = new Map<string, number>();
    for (const face of state.layout) counts.set(face, (counts.get(face) ?? 0) + 1);
    expect(counts.size).toBe(8);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
    expect(state.open).toBe(-1);
    expect(state.moves).toBe(0);
  });

  it('never puts the layout in the view', () => {
    const { state, view } = startMemory();
    const json = JSON.stringify(view);
    for (const face of new Set(state.layout)) {
      expect(json).not.toContain(face);
    }
  });
});

describe('hydrateMemory', () => {
  it('turns a missing matched list into an empty one', () => {
    expect(hydrateMemory({ layout: BOARD, open: -1, moves: 0 }).matched).toEqual([]);
  });
});

describe('parseMemoryAction', () => {
  it.each([-1, 16, 1.5, '3', null])('rejects flip %p', (flip) => {
    expect(() => parseMemoryAction({ flip })).toThrow(RunError);
  });

  it('accepts card indices 0 to 15', () => {
    expect(parseMemoryAction({ flip: 0 })).toEqual({ index: 0 });
    expect(parseMemoryAction({ flip: 15 })).toEqual({ index: 15 });
  });
});

describe('applyMemoryFlip', () => {
  it('reveals the first card of an attempt without counting a move', () => {
    const step = applyMemoryFlip(FRESH, { index: 4 });
    expect(step.response).toEqual({ index: 4, emoji: 'c', moves: 0, pair: 'none' });
    expect(step.state.open).toBe(4);
    expect(step.performance).toBeUndefined();
  });

  it('reports a match with the first card, keeps both matched and counts one move', () => {
    const first = applyMemoryFlip(FRESH, { index: 4 });
    const second = applyMemoryFlip(first.state, { index: 5 });
    expect(second.response).toEqual({ index: 5, emoji: 'c', moves: 1, pair: 'match', other: 4 });
    expect(second.state.matched[4]).toBe(true);
    expect(second.state.matched[5]).toBe(true);
    expect(second.state.open).toBe(-1);
  });

  it('reports a mismatch and closes both cards on the server straight away', () => {
    const first = applyMemoryFlip(FRESH, { index: 0 });
    const second = applyMemoryFlip(first.state, { index: 2 });
    expect(second.response).toEqual({ index: 2, emoji: 'b', moves: 1, pair: 'mismatch', other: 0 });
    expect(second.state.matched.some(Boolean)).toBe(false);
    expect(second.state.open).toBe(-1);
  });

  it('starts a new attempt after a mismatch, so the next flip is pair none', () => {
    const first = applyMemoryFlip(FRESH, { index: 0 });
    const mismatch = applyMemoryFlip(first.state, { index: 2 });
    const next = applyMemoryFlip(mismatch.state, { index: 4 });
    expect(next.response.pair).toBe('none');
    expect(next.response.moves).toBe(1);
  });

  it('rejects flipping a matched card', () => {
    const s = { ...FRESH, matched: [true, true, ...BOARD.slice(2).map(() => false)] };
    expect(() => applyMemoryFlip(s, { index: 1 })).toThrow(RunError);
  });

  it('rejects flipping the card that is already face up', () => {
    const first = applyMemoryFlip(FRESH, { index: 3 });
    expect(() => applyMemoryFlip(first.state, { index: 3 })).toThrow(RunError);
  });

  it('finishes when the last pair matches, with performance from the move count', () => {
    let state: MemoryState = FRESH;
    let moves = 0;
    let last;
    for (let pair = 0; pair < 8; pair++) {
      last = applyMemoryFlip(state, { index: pair * 2 });
      state = last.state;
      last = applyMemoryFlip(state, { index: pair * 2 + 1 });
      state = last.state;
      moves++;
    }
    expect(moves).toBe(8);
    expect(last?.response.pair).toBe('match');
    expect(last?.performance).toBe(memoryPerformance(8));
    expect(last?.performance).toBe(1);
  });

  it('does not finish while another pair is still hidden', () => {
    // Cards 4..15 are matched, so the a and b pairs are still hidden
    const state: MemoryState = { ...FRESH, matched: BOARD.map((_, i) => i >= 4) };
    const first = applyMemoryFlip(state, { index: 0 });
    const second = applyMemoryFlip(first.state, { index: 1 });
    expect(second.response.pair).toBe('match');
    expect(second.performance).toBeUndefined();
  });

  it('a mismatch never finishes the game', () => {
    const state: MemoryState = { ...FRESH, matched: BOARD.map((_, i) => i >= 4) };
    const first = applyMemoryFlip(state, { index: 0 });
    const second = applyMemoryFlip(first.state, { index: 2 });
    expect(second.response.pair).toBe('mismatch');
    expect(second.performance).toBeUndefined();
  });
});
