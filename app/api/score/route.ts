import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { validateScores, calcTotal } from '@/lib/scoring';
import { ratelimit, hashKey } from '@/lib/rateLimit';
import { adminDb } from '@/lib/firebaseAdmin';
import type { Tab } from '@/lib/types';

export async function POST(request: Request) {
  // CSRF: check Origin
  const origin = request.headers.get('origin') ?? '';
  if (origin !== process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Verify session token
  const token = body.token as string;
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  // Validate and extract submissionId before hitting rate limit
  const submissionId = body.submissionId as string;
  if (!submissionId || !/^[0-9a-f-]{36}$/.test(submissionId)) {
    return NextResponse.json({ error: 'Invalid submissionId' }, { status: 400 });
  }

  // Idempotency: return cached result without consuming rate limit window
  const existingRef = adminDb.ref(`submissions/${submissionId}`);
  const existing = await existingRef.get();
  if (existing.val()) {
    return NextResponse.json(existing.val());
  }

  // Rate limit by hashed sessionId
  const { success } = await ratelimit.limit(hashKey(session.sessionId));
  if (!success) {
    return NextResponse.json({ error: 'Already submitted' }, { status: 429 });
  }

  // Validate scores
  const scores = body.scores as Record<Tab, number>;
  if (!scores || !validateScores(scores)) {
    return NextResponse.json({ error: 'Invalid scores' }, { status: 400 });
  }

  const total = calcTotal(scores);
  const now = Date.now();
  const expiresAt = now + 86400000;
  const name = session.name;

  // Rank is approximate under concurrent submissions — acceptable for a single-day booth
  const leaderboardSnap = await adminDb.ref('leaderboard').get();
  const entries: Record<string, { score: number }> = leaderboardSnap.val() ?? {};
  const rank = Object.values(entries).filter((e) => e.score > total).length + 1;

  // Write to Firebase
  await adminDb.ref('leaderboard').push({ name, score: total, timestamp: now, expiresAt });
  await existingRef.set({ rank, expiresAt });

  return NextResponse.json({ rank, total });
}
