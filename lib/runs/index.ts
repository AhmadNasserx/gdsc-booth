import type { GameView } from '../apiTypes';
import type { Tab } from '../types';
import type { RandomInt, Step } from './shared';
import { applyBugAnswer, hydrateBugs, parseBugAction, startBugs, type BugState } from './bugs';
import { applyRiddleAnswer, hydrateRiddles, parseRiddleAction, startRiddles, type RiddleState } from './riddles';
import { applyMemoryFlip, hydrateMemory, parseMemoryAction, startMemory, type MemoryState } from './memory';
import { applyPassword, hydratePassword, parsePasswordAction, startPassword, type PasswordState } from './password';
import { applyTriviaAction, hydrateTrivia, parseTriviaAction, startTrivia, type TriviaState } from './trivia';
import { applyWordleGuess, hydrateWordle, parseWordleAction, startWordle, type WordleState } from './wordle';

export type GameState = RiddleState | TriviaState | BugState | WordleState | MemoryState | PasswordState;

/** Fresh content for one run. The view never carries answers, the word or the layout. */
export function startGame(game: Tab, rand?: RandomInt): { state: GameState; view: GameView } {
  switch (game) {
    case 'riddles': return startRiddles(rand);
    case 'trivia': return startTrivia(rand);
    case 'bugs': return startBugs(rand);
    case 'wordle': return startWordle(rand);
    case 'memory': return startMemory(rand);
    case 'password': return startPassword();
  }
}

/** Fills in fields that RTDB dropped (empty arrays), so the rest of the code can rely on their shape. */
export function hydrateState(game: Tab, raw: unknown): GameState {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  switch (game) {
    case 'riddles': return hydrateRiddles(value);
    case 'trivia': return hydrateTrivia(value);
    case 'bugs': return hydrateBugs(value);
    case 'wordle': return hydrateWordle(value);
    case 'memory': return hydrateMemory(value);
    case 'password': return hydratePassword(value);
  }
}

export type ParsedAction =
  | { game: 'riddles'; action: ReturnType<typeof parseRiddleAction> }
  | { game: 'trivia'; action: ReturnType<typeof parseTriviaAction> }
  | { game: 'bugs'; action: ReturnType<typeof parseBugAction> }
  | { game: 'wordle'; action: ReturnType<typeof parseWordleAction> }
  | { game: 'memory'; action: ReturnType<typeof parseMemoryAction> }
  | { game: 'password'; action: ReturnType<typeof parsePasswordAction> };

/** Checks the body against the shape this game accepts. Throws RunError(400) otherwise. */
export function parseAction(game: Tab, body: Record<string, unknown>): ParsedAction {
  switch (game) {
    case 'riddles': return { game, action: parseRiddleAction(body) };
    case 'trivia': return { game, action: parseTriviaAction(body) };
    case 'bugs': return { game, action: parseBugAction(body) };
    case 'wordle': return { game, action: parseWordleAction(body) };
    case 'memory': return { game, action: parseMemoryAction(body) };
    case 'password': return { game, action: parsePasswordAction(body) };
  }
}

/** Runs one parsed action through its game's state machine. Pure. */
export function applyAction(state: GameState, parsed: ParsedAction): Step<GameState, Record<string, unknown>> {
  switch (parsed.game) {
    case 'riddles':
      return applyRiddleAnswer(state as RiddleState, parsed.action) as Step<GameState, Record<string, unknown>>;
    case 'trivia':
      return applyTriviaAction(state as TriviaState, parsed.action) as Step<GameState, Record<string, unknown>>;
    case 'bugs':
      return applyBugAnswer(state as BugState, parsed.action) as Step<GameState, Record<string, unknown>>;
    case 'wordle':
      return applyWordleGuess(state as WordleState, parsed.action) as Step<GameState, Record<string, unknown>>;
    case 'memory':
      return applyMemoryFlip(state as MemoryState, parsed.action) as Step<GameState, Record<string, unknown>>;
    case 'password':
      return applyPassword(state as PasswordState, parsed.action) as Step<GameState, Record<string, unknown>>;
  }
}
