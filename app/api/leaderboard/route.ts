import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { jsonError, readJsonObject } from '@/lib/runs/http';
import { liveEntries } from '@/lib/runs/ranking';
import type { LeaderboardEntry } from '@/lib/types';

export const revalidate = 0;

/** A wrong PIN is answered this slowly, which makes guessing one at a time tedious. */
const WRONG_PIN_DELAY_MS = 750;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** True when `pin` matches LEADERBOARD_PIN. With no PIN configured nothing matches, so the board stays hidden. */
function pinMatches(pin: unknown): boolean {
  const expected = process.env.LEADERBOARD_PIN;
  if (!expected || typeof pin !== 'string') return false;
  return timingSafeEqual(digest(pin), digest(expected));
}

/** The leaderboard is hidden. It is only returned for the right PIN, sent in the body of a POST. */
export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return jsonError(400, 'Invalid JSON');

  if (!pinMatches(body.pin)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PIN_DELAY_MS));
    return jsonError(403, 'Wrong PIN');
  }

  const snap = await adminDb.ref('leaderboard').get();
  const data = (snap.val() ?? {}) as Record<string, LeaderboardEntry>;
  return NextResponse.json(liveEntries(Object.values(data), Date.now()));
}
