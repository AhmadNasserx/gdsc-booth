import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';
import { RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';
import type { QuestionsPackage } from '@/lib/types';

function stripHtml(str: string): string {
  return str.replace(/[<>"'&]/g, '').trim();
}

function pickIndices(poolSize: number, n: number): number[] {
  const arr = Array.from({ length: poolSize }, (_, i) => i);
  arr.sort(() => Math.random() - 0.5);
  return arr.slice(0, n);
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

  const name = stripHtml(raw);
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (name.length > 30) {
    return NextResponse.json({ error: 'name must be 30 characters or fewer' }, { status: 400 });
  }

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const questions: QuestionsPackage = {
    riddleIndices: pickIndices(RIDDLE_POOL.length, 4),
    triviaIndices: pickIndices(TRIVIA_POOL.length, 3),
    binaryChar: LETTERS[Math.floor(Math.random() * LETTERS.length)],
  };

  const { token } = signSession(name, questions);
  return NextResponse.json({
    token,
    questions: {
      riddles: questions.riddleIndices.map((i) => RIDDLE_POOL[i]),
      trivia: questions.triviaIndices.map((i) => TRIVIA_POOL[i]),
      binaryChar: questions.binaryChar,
    },
  });
}
