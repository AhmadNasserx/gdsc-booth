import { adminDb } from './firebaseAdmin';
import { currentRound, readEventStart, ROUND_MS, roundWindow, topOfRound } from './event';
import { liveEntries } from './runs/ranking';
import type { LeaderboardResponse, RoundResult } from './apiTypes';
import type { LeaderboardEntry } from './types';

/** Live entries, the event clock and the top 3 of every hour so far, unmasked. */
export async function readLeaderboard(now: number): Promise<LeaderboardResponse> {
  const [snap, event] = await Promise.all([adminDb.ref('leaderboard').get(), readEventStart()]);
  const data = (snap.val() ?? {}) as Record<string, LeaderboardEntry>;
  const entries = liveEntries(Object.values(data), now);

  const { startedAt } = event;
  const current = currentRound(startedAt, now);
  const rounds: RoundResult[] = [];
  if (startedAt !== null && current !== null) {
    for (let n = 1; n <= current; n++) {
      const { start, end } = roundWindow(startedAt, n);
      rounds.push({ round: n, start, end, top: topOfRound(entries, startedAt, n) });
    }
  }

  return {
    entries,
    event: {
      startedAt,
      now,
      roundMs: ROUND_MS,
      currentRound: current,
      roundEndsAt: startedAt !== null && current !== null ? roundWindow(startedAt, current).end : null,
    },
    rounds,
  };
}

/** The same board with every name and score taken out, for the public while the mask is on. Pure. */
export function maskLeaderboard(board: LeaderboardResponse): LeaderboardResponse {
  return {
    entries: [],
    event: board.event,
    rounds: board.rounds.map((round) => ({ ...round, top: [] })),
    masked: true,
  };
}
