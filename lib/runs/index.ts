import type { GameView } from '../apiTypes';
import type { Tab } from '../types';
import type { BatchAction, BatchReply, RandomInt, Step } from './shared';
import { gradeBugs, hydrateBugs, parseBugBatch, startBugs, type BugState } from './bugs';
import { gradeRiddles, hydrateRiddles, parseRiddleBatch, startRiddles, type RiddleState } from './riddles';
import { applyMemoryFlip, hydrateMemory, parseMemoryAction, startMemory, type MemoryState } from './memory';

export type GameState = RiddleState | BugState | MemoryState;

/** Games graded in one batch submission. Their questions are answered locally and sent together. */
export type BatchGame = 'riddles' | 'bugs';

export function isBatchGame(game: Tab): game is BatchGame {
  return game === 'riddles' || game === 'bugs';
}

/**
 * Fresh content for one run. `picked` is the pool selection for the content games (indices). It comes from the no-repeat picker. The view never carries answers, the
 * word or the layout.
 */
export function startGame(game: Tab, picked?: Array<number | string>, rand?: RandomInt): { state: GameState; view: GameView } {
  switch (game) {
    case 'riddles': return startRiddles(picked as number[] | undefined, rand);
    case 'bugs': return startBugs(picked as number[] | undefined, rand);
    case 'memory': return startMemory(rand);
  }
}

/** Fills in fields that RTDB dropped (empty arrays), so the rest of the code can rely on their shape. */
export function hydrateState(game: Tab, raw: unknown): GameState {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  switch (game) {
    case 'riddles': return hydrateRiddles(value);
    case 'bugs': return hydrateBugs(value);
    case 'memory': return hydrateMemory(value);
  }
}

export type ParsedAction =
  | { game: 'riddles'; action: BatchAction<string> }
  | { game: 'bugs'; action: BatchAction<number> }
  | { game: 'memory'; action: ReturnType<typeof parseMemoryAction> };

/** Checks the body against the shape this game accepts. Throws RunError(400) otherwise. */
export function parseAction(game: Tab, body: Record<string, unknown>): ParsedAction {
  switch (game) {
    case 'riddles': return { game, action: { answers: parseRiddleBatch(body) } };
    case 'bugs': return { game, action: { answers: parseBugBatch(body) } };
    case 'memory': return { game, action: parseMemoryAction(body) };
  }
}

/** Runs one parsed action through its game's state machine. Pure. */
export function applyAction(state: GameState, parsed: ParsedAction): Step<GameState, Record<string, unknown>> {
  switch (parsed.game) {
    case 'riddles':
      return gradeRiddles(state as RiddleState, parsed.action.answers) as Step<GameState, BatchReply>;
    case 'bugs':
      return gradeBugs(state as BugState, parsed.action.answers) as Step<GameState, BatchReply>;
    case 'memory':
      return applyMemoryFlip(state as MemoryState, parsed.action) as Step<GameState, Record<string, unknown>>;
  }
}
