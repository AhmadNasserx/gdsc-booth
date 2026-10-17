import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { liveEntries } from '@/lib/runs/ranking';
import type { LeaderboardEntry } from '@/lib/types';

export const revalidate = 0;

export async function GET() {
  const snap = await adminDb.ref('leaderboard').get();
  const data = (snap.val() ?? {}) as Record<string, LeaderboardEntry>;
  return NextResponse.json(liveEntries(Object.values(data), Date.now()));
}
