import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { calcPasswordScore } from '@/lib/scoring';
import { adminDb } from '@/lib/firebaseAdmin';
import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';

const TIMER_SECS = 10;

function calcTriviaBonus(correct: boolean, remaining: number): number {
  return correct ? 25 + Math.floor((remaining / TIMER_SECS) * 8) : 0;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = body.token as string;
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  const submissionId = body.submissionId as string;
  if (!submissionId || !/^[0-9a-f-]{36}$/.test(submissionId)) {
    return NextResponse.json({ error: 'Invalid submissionId' }, { status: 400 });
  }

  // Validate answers shape before touching Firebase
  const answers = body.answers as Record<string, unknown> | undefined;
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Invalid answers' }, { status: 400 });
  }
  const { riddles: riddleAnswers, trivia: triviaAnswers, binary: binaryAnswer, password } = answers as {
    riddles: unknown; trivia: unknown; binary: unknown; password: unknown;
  };
  if (
    !Array.isArray(riddleAnswers) || riddleAnswers.length !== 4 ||
    !riddleAnswers.every((a) => typeof a === 'string')
  ) return NextResponse.json({ error: 'Invalid riddle answers' }, { status: 400 });

  if (
    !Array.isArray(triviaAnswers) || triviaAnswers.length !== 3 ||
    !triviaAnswers.every((a) => {
      if (typeof a !== 'object' || a === null) return false;
      const ta = a as Record<string, unknown>;
      return typeof ta.answer === 'string' && typeof ta.remaining === 'number';
    })
  ) return NextResponse.json({ error: 'Invalid trivia answers' }, { status: 400 });

  if (typeof binaryAnswer !== 'string' || !/^[A-Z]$/.test(binaryAnswer)) {
    return NextResponse.json({ error: 'Invalid binary answer' }, { status: 400 });
  }
  if (typeof password !== 'string') {
    return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
  }

  // Idempotency check
  const existingRef = adminDb.ref(`submissions/${submissionId}`);
  const existing = await existingRef.get();
  if (existing.val()) {
    return NextResponse.json(existing.val());
  }

  // One submission per session — atomic claim
  const sessionSlotRef = adminDb.ref(`submissions/by-session/${session.sessionId}`);
  const { committed } = await sessionSlotRef.transaction((current) => {
    if (current !== null) return;
    return submissionId;
  });
  if (!committed) {
    return NextResponse.json({ error: 'Score already submitted for this session' }, { status: 409 });
  }

  // Compute scores server-side from session-assigned questions
  const { riddleIndices, triviaIndices, binaryChar } = session.questions;

  const riddleScore = (riddleAnswers as string[]).reduce(
    (sum, ans, i) => sum + (ans === RIDDLE_POOL[riddleIndices[i]]?.answer ? 25 : 0),
    0,
  );

  const triviaScore = Math.min(
    (triviaAnswers as { answer: string; remaining: number }[]).reduce((sum, a, i) => {
      const remaining = Math.max(0, Math.min(TIMER_SECS, Math.round(a.remaining)));
      return sum + calcTriviaBonus(a.answer === TRIVIA_POOL[triviaIndices[i]]?.answer, remaining);
    }, 0),
    99,
  );

  const binaryScore = binaryAnswer === binaryChar ? 100 : 0;
  const passwordScore = Math.max(0, Math.min(100, calcPasswordScore(password as string)));

  const total = riddleScore + triviaScore + binaryScore + passwordScore;
  const now = Date.now();
  const expiresAt = now + 86400000;
  const name = session.name;

  const leaderboardSnap = await adminDb.ref('leaderboard').get();
  const entries: Record<string, { score: number }> = leaderboardSnap.val() ?? {};
  const rank = Object.values(entries).filter((e) => e.score > total).length + 1;

  await adminDb.ref('leaderboard').push({ name, score: total, timestamp: now, expiresAt });
  await existingRef.set({ rank, expiresAt });

  return NextResponse.json({ rank, total });
}
