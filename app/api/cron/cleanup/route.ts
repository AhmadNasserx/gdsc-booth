import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

/** Paths whose entries carry an `expiresAt` timestamp. Expired entries are removed. */
const EXPIRING_PATHS = ['leaderboard', 'names', 'runs'];

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  let deleted = 0;

  for (const path of EXPIRING_PATHS) {
    const snap = await adminDb.ref(path).get();
    const data: Record<string, { expiresAt?: number }> = snap.val() ?? {};
    for (const [key, entry] of Object.entries(data)) {
      if (typeof entry?.expiresAt === 'number' && entry.expiresAt < now) {
        await adminDb.ref(path).child(key).remove();
        deleted++;
      }
    }
  }

  // Active pointers (runs-active/{sessionId}_{game}) hold a run id and have no expiry of their own.
  // Drop any that point at a run that no longer exists.
  const runsSnap = await adminDb.ref('runs').get();
  const liveRunIds = new Set(Object.keys((runsSnap.val() ?? {}) as Record<string, unknown>));
  const pointersSnap = await adminDb.ref('runs-active').get();
  const pointers = (pointersSnap.val() ?? {}) as Record<string, unknown>;
  for (const [key, runId] of Object.entries(pointers)) {
    if (typeof runId !== 'string' || !liveRunIds.has(runId)) {
      await adminDb.ref('runs-active').child(key).remove();
      deleted++;
    }
  }

  return NextResponse.json({ deleted });
}
