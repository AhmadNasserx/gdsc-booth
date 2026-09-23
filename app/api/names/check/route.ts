import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get('name') ?? '').trim();

  if (!name || !NAME_PATTERN.test(name)) {
    return NextResponse.json({ available: false });
  }

  const normKey = normalizeName(name);
  if (!normKey) return NextResponse.json({ available: false });

  const snap = await adminDb.ref(`names/${normKey}`).get();
  const entry = snap.val() as { expiresAt: number } | null;
  const available = !entry || entry.expiresAt <= Date.now();
  return NextResponse.json({ available });
}
