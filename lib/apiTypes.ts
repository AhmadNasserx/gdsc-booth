import type { Tab } from './types';
export type LetterState = 'correct' | 'present' | 'absent';

export interface RunResult {
  game: Tab;
  score: number;          // points for THIS run
  best: number;           // player's best for this game after this run
  improved: boolean;      // this run became their best for the game
  total: number;          // player's leaderboard total (sum of bests)
  rank: number;           // 1-based overall rank by total
  gamesPlayed: Tab[];     // games with a best score
}

export interface RiddleView { emojis: string; hint: string; options: string[] }
export interface TriviaView { question: string; options: string[] }
export interface BugView { title: string; language: string; lines: string[] }

export type GameView =
  | { game: 'riddles'; questions: RiddleView[] }
  | { game: 'trivia'; questions: TriviaView[] }
  | { game: 'bugs'; questions: BugView[] }
  | { game: 'wordle' }
  | { game: 'memory'; cards: number }      // 16
  | { game: 'password' };

export interface StartResponse { runId: string; view: GameView }

// ---- actions (POST /api/game/action body = { token, runId, ...action }) ----
export type ActionBody =
  | { answers: (string | number | null)[] }  // riddles, trivia (option text), bugs (0-based line index). The whole run in one submission; null = unanswered
  | { guess: string }                        // wordle: 5 letters A-Z
  | { flip: number }                         // memory: card index 0..15
  | { password: string };                    // password: final submission

/** One entry per question of a batch-graded run. Sent in BatchResponse, for every question. */
export interface ReviewItem {
  answered: boolean;
  correct: boolean;
  correctAnswer: string | number;   // string for riddles/trivia, line index for bugs
  explanation?: string;             // bugs only
}

/** Reply to the one batch submission of a riddles, trivia or bugs run. Also returned again on a retry. */
export interface BatchResponse { results: ReviewItem[]; done: true; result: RunResult }

export interface GuessResponse {   // wordle
  states: LetterState[];            // length 5
  solved: boolean;
  done: boolean;
  hint?: string;                    // present once >= 2 guesses have been made
  word?: string;                    // present only when done && !solved
  result?: RunResult;
}
export interface FlipResponse {    // memory
  index: number;
  emoji: string;                    // face of the flipped card
  moves: number;                    // completed pair attempts so far
  pair: 'none' | 'match' | 'mismatch';   // 'none' = first card of an attempt
  other?: number;                   // index of the first card of the attempt (when pair !== 'none')
  done: boolean;
  result?: RunResult;
}
export interface PasswordResponse { score: number; done: true; result: RunResult }  // score = points for this password's strength (informational)

export interface MeResponse {       // POST /api/me { token }
  name: string;
  total: number;
  rank: number | null;              // null if no scored game yet
  bests: Partial<Record<Tab, number>>;
}
export interface ApiError { error: string }
