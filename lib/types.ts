export type Tab = 'riddles' | 'trivia' | 'password' | 'wordle' | 'memory' | 'bugs';

export const TABS: Tab[] = ['riddles', 'trivia', 'password', 'wordle', 'memory', 'bugs'];

export interface QuestionsPackage {
  riddleIndices: number[];
  triviaIndices: number[];
  bugIndices: number[];
  wordleWord: string;
}

export interface SessionPayload {
  sessionId: string;
  name: string;
  issuedAt: number;
  questions: QuestionsPackage;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  game?: Tab;
  timestamp: number;
  expiresAt: number;
}

export interface SubmissionRecord {
  rank: number;
  total: number;
  game: Tab;
  best: number;
  improved: boolean;
  expiresAt: number;
}
