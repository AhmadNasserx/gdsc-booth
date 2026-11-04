import type { RoundResult } from './apiTypes';
import type { LeaderboardEntry } from './types';

/** One winner as the ceremony reveals it. Rank 1 is the best. */
export interface Winner {
  rank: number;
  name: string;
  score: number;
}

/**
 * The best `count` players who finished all three games, best first. Ties go to whoever reached
 * their total first, the same rule as the leaderboard and the hourly prizes. Pure.
 */
export function topFinishers(entries: readonly LeaderboardEntry[], count: number): Winner[] {
  return entries
    .filter((entry) => typeof entry.finishedAt === 'number')
    .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
    .slice(0, count)
    .map((entry, i) => ({ rank: i + 1, name: entry.name, score: entry.score }));
}

/** One hour's top 3, best first. Pure. */
export function hourWinners(round: RoundResult): Winner[] {
  return [...round.top]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3)
    .map((top) => ({ rank: top.rank, name: top.name, score: top.score }));
}

/** Every name on the board, for the spinning reel. Pure. */
export function reelNames(entries: readonly LeaderboardEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.name)));
}
