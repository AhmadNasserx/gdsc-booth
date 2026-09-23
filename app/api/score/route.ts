import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { calcPasswordScore, calcWordleScore } from '@/lib/scoring';
import { adminDb } from '@/lib/firebaseAdmin';
import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';

const TRIVIA_CORRECT_PTS = 20;
const TRIVIA_WRONG_PENALTY = 10;
const MAX_TRIVIA_SCORE = 300;

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

  const MIN_PLAY_MS = 45_000;
  if (Date.now() - session.issuedAt < MIN_PLAY_MS) {
    return NextResponse.json({ error: 'Score submitted too quickly' }, { status: 429 });
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
  const { riddles: riddleAnswers, trivia: triviaAnswers, binary: binaryAnswer, password, wordle: wordleGuesses } = answers as {
    riddles: unknown; trivia: unknown; binary: unknown; password: unknown; wordle: unknown;
  };

  if (
    !Array.isArray(riddleAnswers) || riddleAnswers.length !== 5 ||
    !riddleAnswers.every((a) => typeof a === 'string')
  ) return NextResponse.json({ error: 'Invalid riddle answers' }, { status: 400 });

  if (
    !Array.isArray(triviaAnswers) ||
    triviaAnswers.length > session.questions.triviaIndices.length ||
    !triviaAnswers.every((a) => {
      if (typeof a !== 'object' || a === null) return false;
      return typeof (a as Record<string, unknown>).answer === 'string';
    })
  ) return NextResponse.json({ error: 'Invalid trivia answers' }, { status: 400 });

  if (typeof binaryAnswer !== 'string' || !/^[A-Z]$/.test(binaryAnswer)) {
    return NextResponse.json({ error: 'Invalid binary answer' }, { status: 400 });
  }
  if (typeof password !== 'string') {
    return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
  }

  if (
    !Array.isArray(wordleGuesses) ||
    wordleGuesses.length === 0 ||
    wordleGuesses.length > 6 ||
    !wordleGuesses.every((g) => typeof g === 'string' && /^[A-Z]{5}$/.test(g))
  ) return NextResponse.json({ error: 'Invalid wordle guesses' }, { status: 400 });

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
    return { submissionId, expiresAt: Date.now() + 172800000 };
  });
  if (!committed) {
    return NextResponse.json({ error: 'Score already submitted for this session' }, { status: 409 });
  }

  // Compute scores server-side from session-assigned questions
  const { riddleIndices, triviaIndices, binaryChar } = session.questions;

  const riddleScore = (riddleAnswers as string[]).reduce(
    (sum, ans, i) => sum + (ans === RIDDLE_POOL[riddleIndices[i]]?.answer ? 40 : 0),
    0,
  );

  // Mirror client-side logic: correct=+20, wrong=-10 (floor at 0 per answer), cap at MAX
  const triviaScore = Math.min(
    (triviaAnswers as { answer: string }[]).reduce((sum, a, i) => {
      const correct = a.answer === TRIVIA_POOL[triviaIndices[i]]?.answer;
      return Math.max(0, sum + (correct ? TRIVIA_CORRECT_PTS : -TRIVIA_WRONG_PENALTY));
    }, 0),
    MAX_TRIVIA_SCORE,
  );

  const binaryScore = binaryAnswer === binaryChar ? 150 : 0;
  const passwordScore = Math.max(0, Math.min(200, calcPasswordScore(password as string)));

  const wGuesses = wordleGuesses as string[];
  const wordleSolved = wGuesses[wGuesses.length - 1] === session.questions.wordleWord;
  const wordleScore = calcWordleScore(wGuesses.length, wordleSolved);

  const total = riddleScore + triviaScore + binaryScore + passwordScore + wordleScore;
  const now = Date.now();
  const expiresAt = now + 172800000;
  const name = session.name;

  const leaderboardSnap = await adminDb.ref('leaderboard').get();
  const entries: Record<string, { score: number }> = leaderboardSnap.val() ?? {};
  const rank = Object.values(entries).filter((e) => e.score > total).length + 1;

  await adminDb.ref('leaderboard').push({ name, score: total, timestamp: now, expiresAt });
  await existingRef.set({ rank, expiresAt });

  return NextResponse.json({ rank, total });
}
