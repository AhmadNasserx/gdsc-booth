import type { LeaderboardEntry, Tab } from './types';
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

/**
 * riddles and trivia: check one question as it is answered. The server locks in the first answer
 * for that question and replies with whether it was right. `index` is the question's place in the run.
 */
export interface CheckBody { check: { index: number; answer: string } }

/** Reply to a check. Only the checked question is revealed. The run is not finished by a check. */
export type CheckResponse = { index: number; correct: boolean; correctAnswer: string; explanation?: string };

export type ActionBody =
  | { answers: (string | number | null)[] }  // riddles and trivia (option text). The whole run in one submission; null = unanswered
  | CheckBody                                // riddles and trivia: one question checked as it is answered
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

/** One finished hour's top 3 as the leaderboard API reports it. Phone numbers are never included. */
export interface RoundTop { name: string; score: number; rank: number }
/** One prize hour, with its window and its top 3. */
export interface RoundResult { round: number; start: number; end: number; top: RoundTop[] }
/** The event clock as the server sees it. */
export interface EventInfo {
  startedAt: number | null;
  now: number;                  // server time when the response was built
  roundMs: number;
  currentRound: number | null;  // null until the first player starts
  roundEndsAt: number | null;   // end of the current hour
}
/** GET /api/leaderboard. */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  event: EventInfo;
  rounds: RoundResult[];
  /** True while staff hide the board for a winners ceremony: entries and every hour's top are then empty. */
  masked?: boolean;
}
