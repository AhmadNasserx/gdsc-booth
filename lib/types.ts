export type Tab = 'riddles' | 'memory' | 'trivia';

/** The games in the order they are played. Each is played once. */
export const TABS: Tab[] = ['riddles', 'memory', 'trivia'];

/** Contents of the signed session token. Nothing about the questions travels in it. */
export interface SessionPayload {
  sessionId: string;
  name: string;
  issuedAt: number;
}

export interface LeaderboardEntry {
  name: string;
  /** Sum of the player's best score in each game they have played. */
  score: number;
  /** Best score per game (0 is a valid best). */
  games?: Partial<Record<Tab, number>>;
  /** When the current total was last reached. Earlier timestamps win ties. */
  timestamp: number;
  expiresAt: number;
}
