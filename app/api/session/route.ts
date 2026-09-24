import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';
import { RIDDLE_POOL, TRIVIA_POOL, WORDLE_POOL } from '@/lib/questions';
import { adminDb } from '@/lib/firebaseAdmin';
import type { QuestionsPackage } from '@/lib/types';

const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
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
  if (!name || !NAME_PATTERN.test(name)) {
    return NextResponse.json(
      { error: 'Name must be 2–30 characters: letters, numbers, and spaces only.' },
      { status: 400 },
    );
  }

  // Atomically claim the name — prevents duplicate display names
  const normKey = normalizeName(name);
  const { committed } = await adminDb.ref(`names/${normKey}`).transaction((current) => {
    const entry = current as { expiresAt: number } | null;
    if (entry !== null && entry.expiresAt > Date.now()) return; // still taken
    return { claimedAt: Date.now(), expiresAt: Date.now() + 172800000 };
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
    binaryChar: String(Math.floor(Math.random() * 99) + 1), // 1–99
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
      binaryChar: questions.binaryChar,
      wordleWord: questions.wordleWord,
      wordleHint: wordleEntry.hint,
    },
  });
}
