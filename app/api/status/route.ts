import { NextResponse } from 'next/server';
import { isPaused, PAUSED_MESSAGE } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Public game status. Players read it to see whether the game is paused. */
export async function GET(): Promise<NextResponse> {
  try {
    const paused = await isPaused();
    const body = paused ? { paused: true, message: PAUSED_MESSAGE } : { paused: false };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Status API error', (err as Error).name);
    return NextResponse.json({ error: 'Server error. Try again.' }, { status: 500 });
  }
}
