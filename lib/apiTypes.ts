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

export type GameView =
  | { game: 'riddles'; questions: RiddleView[] }
  | { game: 'trivia'; questions: TriviaView[] }
  | { game: 'memory'; cards: number };     // 16

export interface StartResponse { runId: string; view: GameView }

// ---- actions (POST /api/game/action body = { token, runId, ...action }) ----
export type ActionBody =
  | { answers: (string | number | null)[] }  // riddles and trivia (option text). The whole run in one submission; null = unanswered
  | { flip: number };                        // memory: card index 0..15

/** One entry per question of a batch-graded run. Sent in BatchResponse, for every question. */
export interface ReviewItem {
  answered: boolean;
  correct: boolean;
  correctAnswer: string;
  explanation?: string;
}

/** Reply to the one batch submission of a riddles or trivia run. Also returned again on a retry. */
export interface BatchResponse { results: ReviewItem[]; done: true; result: RunResult }

export interface FlipResponse {    // memory
  index: number;
  emoji: string;                    // face of the flipped card
  moves: number;                    // completed pair attempts so far
  pair: 'none' | 'match' | 'mismatch';   // 'none' = first card of an attempt
  other?: number;                   // index of the first card of the attempt (when pair !== 'none')
  done: boolean;
  result?: RunResult;
}

export interface MeResponse {       // POST /api/me { token }
  name: string;
  total: number;
  rank: number | null;              // null if no scored game yet
  bests: Partial<Record<Tab, number>>;
}
export interface ApiError { error: string }
