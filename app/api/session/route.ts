import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';

function stripHtml(str: string): string {
  return str.replace(/[<>"'&]/g, '').trim();
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

  const { token } = signSession(name);
  return NextResponse.json({ token });
}
