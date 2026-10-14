import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';
import { RIDDLE_POOL, TRIVIA_POOL, BUG_POOL, WORDLE_POOL } from '@/lib/questions';
import { adminDb } from '@/lib/firebaseAdmin';
import { NAME_PATTERN, normalizeName, hashPlayerKey, isValidPlayerKey } from '@/lib/names';
import type { QuestionsPackage } from '@/lib/types';

const NAME_TTL_MS = 172800000;

interface NameEntry {
  keyHash: string;
  claimedAt: number;
  expiresAt: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickIndices(poolSize: number, n: number): number[] {
  return shuffleArray(Array.from({ length: poolSize }, (_, i) => i)).slice(0, n);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>)?.name;
  if (typeof raw !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const name = raw.trim();
  const normKey = normalizeName(name);
  // A name made only of characters that normalize away (e.g. "ÀÀ") would address the whole names/ node
  if (!name || !NAME_PATTERN.test(name) || !normKey) {
    return NextResponse.json(
      { error: 'Name must be 2–30 characters: letters, numbers, and spaces only.' },
      { status: 400 },
    );
  }

  const playerKey = (body as Record<string, unknown>)?.playerKey;
  if (!isValidPlayerKey(playerKey)) {
    return NextResponse.json({ error: 'Invalid player key' }, { status: 400 });
  }

  // Claim the name for this player key. Only the hash is stored.
  // Unexpired claims by a different key are refused; the same key may reclaim its own name.
  const now = Date.now();
  const keyHash = hashPlayerKey(playerKey);
  const { committed } = await adminDb.ref(`names/${normKey}`).transaction((current) => {
    const entry = current as NameEntry | null;
    if (entry && entry.expiresAt > now && entry.keyHash !== keyHash) return; // held by another player
    const next: NameEntry = { keyHash, claimedAt: now, expiresAt: now + NAME_TTL_MS };
    return next;
  });
  if (!committed) {
    return NextResponse.json(
      { error: 'Display name already taken. Choose another.' },
      { status: 409 },
    );
  }

  const wordleEntry = WORDLE_POOL[Math.floor(Math.random() * WORDLE_POOL.length)];
  const questions: QuestionsPackage = {
    riddleIndices: pickIndices(RIDDLE_POOL.length, 5),
    triviaIndices: pickIndices(TRIVIA_POOL.length, 15),
    bugIndices: pickIndices(BUG_POOL.length, 5),
    wordleWord: wordleEntry.word,
  };

  const { token } = signSession(name, questions);
  return NextResponse.json({
    token,
    questions: {
      riddles: questions.riddleIndices.map((i) => {
        const r = RIDDLE_POOL[i];
        return { ...r, options: shuffleArray([...r.options]) };
      }),
      trivia: questions.triviaIndices.map((i) => {
        const q = TRIVIA_POOL[i];
        return { ...q, options: shuffleArray([...q.options]) };
      }),
      bugs: questions.bugIndices.map((i) => ({ ...BUG_POOL[i] })),
      wordleWord: questions.wordleWord,
      wordleHint: wordleEntry.hint,
    },
  });
}
