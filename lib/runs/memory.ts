import type { FlipResponse } from '../apiTypes';
import { memoryPerformance } from '../scoring';
import { listOf, numberOf, RunError, secureRandomInt, shuffle, type RandomInt, type Step } from './shared';

const EMOJIS = ['🐍', '⚛️', '🔥', '🐳', '🦀', '☁️', '🤖', '🔐'];
export const MEMORY_CARDS = EMOJIS.length * 2;

export interface MemoryState {
  /** Face of every card, in board order. Never sent to the client before it is flipped. */
  layout: string[];
  matched: boolean[];
  /** Index of the first card of the attempt in progress, or -1 when no card is face up. */
  open: number;
  /** Completed pair attempts. */
  moves: number;
}

export interface MemoryAction {
  index: number;
}

export type MemoryResponse = Omit<FlipResponse, 'done' | 'result'>;

export function startMemory(rand: RandomInt = secureRandomInt): { state: MemoryState; view: { game: 'memory'; cards: number } } {
  const layout = shuffle([...EMOJIS, ...EMOJIS], rand);
  return {
    state: { layout, matched: layout.map(() => false), open: -1, moves: 0 },
    view: { game: 'memory', cards: MEMORY_CARDS },
  };
}

export function hydrateMemory(raw: Partial<MemoryState> | null | undefined): MemoryState {
  return {
    layout: listOf<string>(raw?.layout),
    matched: listOf<boolean>(raw?.matched),
    open: numberOf(raw?.open, -1),
    moves: numberOf(raw?.moves),
  };
}

export function parseMemoryAction(body: Record<string, unknown>): MemoryAction {
  const index = body.flip;
  if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= MEMORY_CARDS) {
    throw new RunError(400, `flip must be a card index from 0 to ${MEMORY_CARDS - 1}`);
  }
  return { index: index as number };
}

/**
 * One flip. The first card of an attempt is revealed and waits. The second card completes the
 * attempt: a match stays face up, a mismatch is reported and closed on the server at once, so
 * the next flip always starts a new attempt. `moves` counts completed attempts.
 */
export function applyMemoryFlip(state: MemoryState, action: MemoryAction): Step<MemoryState, MemoryResponse> {
  const { index } = action;
  if (state.matched[index]) throw new RunError(400, 'That card is already matched');
  if (index === state.open) throw new RunError(400, 'That card is already face up');

  const emoji = state.layout[index];

  if (state.open === -1) {
    return {
      state: { ...state, open: index },
      response: { index, emoji, moves: state.moves, pair: 'none' },
    };
  }

  const first = state.open;
  const match = state.layout[first] === emoji;
  const matched = [...state.matched];
  if (match) {
    matched[first] = true;
    matched[index] = true;
  }
  const moves = state.moves + 1;
  const finished = matched.every(Boolean);

  return {
    state: { layout: state.layout, matched, open: -1, moves },
    response: {
      index,
      emoji,
      moves,
      pair: match ? 'match' : 'mismatch',
      other: first,
    },
    performance: finished ? memoryPerformance(moves) : undefined,
  };
}
