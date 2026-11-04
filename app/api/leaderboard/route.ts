import { NextResponse } from 'next/server';
import { maskLeaderboard, readLeaderboard } from '@/lib/leaderboard';
import { isMasked } from '@/lib/mask';

export const revalidate = 0;

/**
 * Live entries, the event clock, and the top 3 of every hour so far. Reads only the leaderboard
 * and the event start. While staff have masked the board for a ceremony, names and scores are
 * left out and `masked` is true.
 */
export async function GET() {
  const now = Date.now();
  const [board, masked] = await Promise.all([readLeaderboard(now), isMasked()]);
  return NextResponse.json(masked ? maskLeaderboard(board) : board, { headers: { 'Cache-Control': 'no-store' } });
}
