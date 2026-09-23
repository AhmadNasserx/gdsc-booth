import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import type { LeaderboardEntry } from '@/lib/types';

export const revalidate = 0;

export async function GET() {
  const snap = await adminDb.ref('leaderboard').get();
  const data = snap.val() as Record<string, LeaderboardEntry> | null;
  const entries: LeaderboardEntry[] = data ? Object.values(data) : [];
  return NextResponse.json(entries);
}
