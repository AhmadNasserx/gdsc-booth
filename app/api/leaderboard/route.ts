import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { currentRound, readEventStart, ROUND_MS, roundWindow, topOfRound } from '@/lib/event';
import { liveEntries } from '@/lib/runs/ranking';
import type { LeaderboardResponse, RoundResult } from '@/lib/apiTypes';
import type { LeaderboardEntry } from '@/lib/types';

export const revalidate = 0;

/** Live entries, the event clock, and the top 3 of every hour so far. Reads only the leaderboard and the event start. */
export async function GET() {
  const now = Date.now();
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

  const body: LeaderboardResponse = {
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
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
