import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import {
  calcMemoryScore,
  calcPasswordScore,
  calcWordleScore,
  isPlausibleMemory,
  normalizeScore,
} from '@/lib/scoring';
import { adminDb } from '@/lib/firebaseAdmin';
import { BUG_POOL, RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';
import { normalizeName } from '@/lib/names';
import {
  TABS,
  type LeaderboardEntry,
  type QuestionsPackage,
  type SubmissionRecord,
  type Tab,
} from '@/lib/types';

const MIN_PLAY_MS = 20_000;
const TRIVIA_CORRECT_PTS = 20;
const TRIVIA_WRONG_PENALTY = 10;
const PER_QUESTION_PTS = 40;
const SUBMISSION_TTL_MS = 172800000;

function isTab(value: unknown): value is Tab {
  return typeof value === 'string' && (TABS as string[]).includes(value);
}

/** Checks the answer shape for one game. Grading happens separately, after the gates. */
function isValidAnswer(game: Tab, answer: unknown, questions: QuestionsPackage): boolean {
  switch (game) {
    case 'riddles':
      return (
        Array.isArray(answer) && answer.length === 5 &&
        answer.every((a) => typeof a === 'string')
      );
    case 'trivia':
      return (
        Array.isArray(answer) &&
        answer.length <= questions.triviaIndices.length &&
        answer.every((a) => {
          if (typeof a !== 'object' || a === null) return false;
          return typeof (a as Record<string, unknown>).answer === 'string';
        })
      );
    case 'password':
      return typeof answer === 'string';
    case 'wordle':
      return (
        Array.isArray(answer) &&
        answer.length >= 1 && answer.length <= 6 &&
        answer.every((g) => typeof g === 'string' && /^[A-Z]{5}$/.test(g))
      );
    case 'memory': {
      if (typeof answer !== 'object' || answer === null) return false;
      const { moves, seconds } = answer as Record<string, unknown>;
      return isPlausibleMemory(moves, seconds);
    }
    case 'bugs':
      return (
        Array.isArray(answer) && answer.length === 5 &&
        answer.every((a) => Number.isInteger(a) && (a as number) >= 0)
      );
    default:
      return false;
  }
}

/** Raw points for the chosen game only. Answers are assumed to be shape-validated. */
function gradeGame(game: Tab, answer: unknown, questions: QuestionsPackage): number {
  switch (game) {
    case 'riddles': {
      const answers = answer as string[];
      return answers.reduce(
        (sum, ans, i) => sum + (ans === RIDDLE_POOL[questions.riddleIndices[i]]?.answer ? PER_QUESTION_PTS : 0),
        0,
      );
    }
    case 'trivia': {
      const answers = answer as { answer: string }[];
      // Floor at 0 after each answer, then cap at the game maximum
      const raw = answers.reduce((sum, a, i) => {
        const correct = a.answer === TRIVIA_POOL[questions.triviaIndices[i]]?.answer;
        return Math.max(0, sum + (correct ? TRIVIA_CORRECT_PTS : -TRIVIA_WRONG_PENALTY));
      }, 0);
      return Math.min(raw, 300);
    }
    case 'password':
      return calcPasswordScore(answer as string);
    case 'wordle': {
      const guesses = answer as string[];
      const solved = guesses[guesses.length - 1] === questions.wordleWord;
      return calcWordleScore(guesses.length, solved);
    }
    case 'memory': {
      const { moves, seconds } = answer as { moves: number; seconds: number };
      return calcMemoryScore(moves, seconds);
    }
    case 'bugs': {
      const answers = answer as number[];
      return answers.reduce(
        (sum, ans, i) => sum + (ans === BUG_POOL[questions.bugIndices[i]]?.answer ? PER_QUESTION_PTS : 0),
        0,
      );
    }
    default:
      return 0;
  }
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

  const game = body.game;
  if (!isTab(game)) {
    return NextResponse.json({ error: 'Invalid game' }, { status: 400 });
  }

  const submissionId = body.submissionId as string;
  if (!submissionId || !/^[0-9a-f-]{36}$/.test(submissionId)) {
    return NextResponse.json({ error: 'Invalid submissionId' }, { status: 400 });
  }

  // Validate the answer shape before touching Firebase
  if (!isValidAnswer(game, body.answer, session.questions)) {
    return NextResponse.json({ error: `Invalid ${game} answer` }, { status: 400 });
  }

  if (Date.now() - session.issuedAt < MIN_PLAY_MS) {
    return NextResponse.json({ error: 'Score submitted too quickly' }, { status: 429 });
  }

  // Idempotency check
  const existingRef = adminDb.ref(`submissions/${submissionId}`);
  const existing = await existingRef.get();
  if (existing.val()) {
    const prior = existing.val() as SubmissionRecord;
    // Records written before best-per-name lack best/improved; fall back to the run's own score.
    return NextResponse.json({
      rank: prior.rank,
      total: prior.total,
      game: prior.game,
      best: prior.best ?? prior.total,
      improved: prior.improved ?? false,
    });
  }

  // One submission per session — atomic claim
  const sessionSlotRef = adminDb.ref(`submissions/by-session/${session.sessionId}`);
  const { committed } = await sessionSlotRef.transaction((current) => {
    if (current !== null) return;
    return { submissionId, expiresAt: Date.now() + SUBMISSION_TTL_MS };
  });
  if (!committed) {
    return NextResponse.json({ error: 'Score already submitted for this session' }, { status: 409 });
  }

  const raw = gradeGame(game, body.answer, session.questions);
  const total = normalizeScore(game, raw);
  const now = Date.now();
  const expiresAt = now + SUBMISSION_TTL_MS;
  const name = session.name;

  // One leaderboard entry per player (keyed by normalized name), holding their best run.
  // Legacy push-id entries are not touched.
  // The callback can run more than once, so the outcome is reassigned on every run and only the last one counts.
  let outcome = { best: total, improved: true };
  await adminDb.ref(`leaderboard/${normalizeName(name)}`).transaction((current) => {
    const entry = current as LeaderboardEntry | null;
    // An expired entry no longer counts as a best, so a fresh run replaces it
    const live = entry !== null && entry.expiresAt > now;
    if (live && entry.score >= total) {
      outcome = { best: entry.score, improved: false };
      return { ...entry, expiresAt };
    }
    outcome = { best: total, improved: true };
    return { name, score: total, game, timestamp: now, expiresAt };
  });
  const { best, improved } = outcome;

  // Rank among everyone else's best scores, using this player's best (not this run)
  const leaderboardSnap = await adminDb.ref('leaderboard').get();
  const entries: Record<string, { score: number }> = leaderboardSnap.val() ?? {};
  const rank = Object.values(entries).filter((e) => e.score > best).length + 1;

  await existingRef.set({ rank, total, game, best, improved, expiresAt } satisfies SubmissionRecord);

  return NextResponse.json({ rank, total, game, best, improved });
}
