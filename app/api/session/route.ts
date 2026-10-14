import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';
import { adminDb } from '@/lib/firebaseAdmin';
import { NAME_PATTERN, normalizeName, hashPlayerKey, isValidPlayerKey } from '@/lib/names';

const NAME_TTL_MS = 172800000;

interface NameEntry {
  keyHash: string;
  claimedAt: number;
  expiresAt: number;
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

  const { token } = signSession(name);
  return NextResponse.json({ token });
}
