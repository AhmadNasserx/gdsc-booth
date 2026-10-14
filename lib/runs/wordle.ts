import { WORDLE_POOL } from '../questions';
import type { GuessResponse, LetterState } from '../apiTypes';
import { wordlePerformance } from '../scoring';
import { RunError, secureRandomInt, type RandomInt, type Step } from './shared';

export const WORDLE_LENGTH = 5;
export const WORDLE_MAX_GUESSES = 6;
/** The hint is shown once the player has made this many guesses. */
const HINT_AFTER_GUESSES = 2;

export interface WordleState {
  word: string;
  hint: string;
  guesses: string[];
}

export interface WordleAction {
  guess: string;
}

export type WordleResponse = Omit<GuessResponse, 'done' | 'result'>;

export function startWordle(
  word?: string,
  rand: RandomInt = secureRandomInt,
): { state: WordleState; view: { game: 'wordle' } } {
  let entry = WORDLE_POOL[rand(WORDLE_POOL.length)];
  if (word !== undefined) {
    const chosen = WORDLE_POOL.find((w) => w.word === word);
    if (!chosen) throw new Error(`unknown wordle word ${word}`);
    entry = chosen;
  }
  return { state: { word: entry.word, hint: entry.hint, guesses: [] }, view: { game: 'wordle' } };
}

export function hydrateWordle(raw: Partial<WordleState> | null | undefined): WordleState {
  const guesses = raw?.guesses;
  return {
    word: typeof raw?.word === 'string' ? raw.word : '',
    hint: typeof raw?.hint === 'string' ? raw.hint : '',
    // RTDB drops empty arrays, so a run with no guesses has no `guesses` key at all.
    guesses: Array.isArray(guesses) ? guesses : guesses && typeof guesses === 'object' ? Object.values(guesses) : [],
  };
}

export function parseWordleAction(body: Record<string, unknown>): WordleAction {
  if (typeof body.guess !== 'string') throw new RunError(400, 'guess must be a string');
  const guess = body.guess.toUpperCase();
  if (!new RegExp(`^[A-Z]{${WORDLE_LENGTH}}$`).test(guess)) {
    throw new RunError(400, `guess must be ${WORDLE_LENGTH} letters A-Z`);
  }
  return { guess };
}

/**
 * Per-letter colours. Two passes so repeated letters are counted correctly: a letter is only
 * "present" while the word still has an unused copy of it, and exact matches are used up first.
 */
export function evaluateGuess(guess: string, word: string): LetterState[] {
  const result: LetterState[] = Array<LetterState>(WORDLE_LENGTH).fill('absent');
  const wordArr = word.split('');
  const guessArr = guess.split('');
  const used = Array<boolean>(WORDLE_LENGTH).fill(false);
  const correctPositions = new Set<number>();

  // First pass: correct positions
  for (let i = 0; i < WORDLE_LENGTH; i++) {
    if (guessArr[i] === wordArr[i]) {
      result[i] = 'correct';
      used[i] = true;
      correctPositions.add(i);
    }
  }
  // Second pass: present letters
  for (let i = 0; i < WORDLE_LENGTH; i++) {
    if (correctPositions.has(i)) continue;
    for (let j = 0; j < WORDLE_LENGTH; j++) {
      if (!used[j] && guessArr[i] === wordArr[j]) {
        result[i] = 'present';
        used[j] = true;
        break;
      }
    }
  }
  return result;
}

export function applyWordleGuess(state: WordleState, action: WordleAction): Step<WordleState, WordleResponse> {
  if (state.guesses.length >= WORDLE_MAX_GUESSES) throw new RunError(409, 'This game is already finished');

  const guesses = [...state.guesses, action.guess];
  const solved = action.guess === state.word;
  const finished = solved || guesses.length === WORDLE_MAX_GUESSES;

  const response: WordleResponse = {
    states: evaluateGuess(action.guess, state.word),
    solved,
  };
  if (guesses.length >= HINT_AFTER_GUESSES) response.hint = state.hint;
  if (finished && !solved) response.word = state.word;

  return {
    state: { word: state.word, hint: state.hint, guesses },
    response,
    performance: finished ? wordlePerformance(guesses.length, solved) : undefined,
  };
}
