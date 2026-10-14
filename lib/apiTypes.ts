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
  | { answer: string }            // riddles, trivia ('' = unanswered/timeout counts wrong)
  | { answer: number }            // bugs: 0-based line index
  | { finish: true }              // trivia only: time ran out, finalise with answers so far
  | { guess: string }             // wordle: 5 letters A-Z
  | { flip: number }              // memory: card index 0..15
  | { password: string };         // password: final submission

export interface AnswerResponse {   // riddles, trivia, bugs
  correct: boolean;
  correctAnswer: string | number;   // revealed after answering (string for riddles/trivia, line index for bugs)
  explanation?: string;             // bugs only
  done: boolean;
  result?: RunResult;               // present when done
}
export interface FinishResponse { done: true; result: RunResult }  // trivia {finish:true}
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
