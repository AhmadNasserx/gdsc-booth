export type Tab = 'riddles' | 'trivia' | 'binary' | 'password';

export interface QuestionsPackage {
  riddleIndices: number[];
  triviaIndices: number[];
  binaryChar: string;
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
  timestamp: number;
  expiresAt: number;
}

export interface SubmissionRecord {
  rank: number;
  expiresAt: number;
}
