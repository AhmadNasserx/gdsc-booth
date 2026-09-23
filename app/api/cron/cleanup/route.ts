import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  let deleted = 0;

  // Each path stores objects with an `expiresAt` field.
  // submissions/by-session is iterated separately from submissions to avoid treating
  // the nested by-session object as a single entry.
  for (const path of ['leaderboard', 'submissions', 'submissions/by-session', 'names']) {
    const snap = await adminDb.ref(path).get();
    const data: Record<string, { expiresAt?: number }> = snap.val() ?? {};
    for (const [key, entry] of Object.entries(data)) {
      if (typeof entry?.expiresAt === 'number' && entry.expiresAt < now) {
        await adminDb.ref(path).child(key).remove();
        deleted++;
      }
    }
  }

  return NextResponse.json({ deleted });
}
