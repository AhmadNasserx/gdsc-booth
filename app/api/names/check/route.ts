import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { NAME_PATTERN, normalizeName, hashPlayerKey, isValidPlayerKey } from '@/lib/names';

interface NameEntry {
  keyHash?: string;
  expiresAt: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') ?? '').trim();

  if (!name || !NAME_PATTERN.test(name)) {
    return NextResponse.json({ available: false });
  }

  const normKey = normalizeName(name);
  if (!normKey) return NextResponse.json({ available: false });

  // playerKey is optional. Without a valid key the caller can never be "mine".
  const playerKey = searchParams.get('playerKey');

  const snap = await adminDb.ref(`names/${normKey}`).get();
  const entry = snap.val() as NameEntry | null;
  const now = Date.now();

  if (!entry || entry.expiresAt <= now) {
    return NextResponse.json({ available: true });
  }

  if (isValidPlayerKey(playerKey) && entry.keyHash === hashPlayerKey(playerKey)) {
    return NextResponse.json({ available: true, mine: true });
  }

  return NextResponse.json({ available: false });
}
