import { NextResponse } from 'next/server';
import { GAME_PAUSED, PAUSED_MESSAGE } from '@/lib/config';
import { verifySession } from '@/lib/session';
import { startRun } from '@/lib/runs/service';
import { errorResponse, jsonError, readJsonObject } from '@/lib/runs/http';
import { TABS, type Tab } from '@/lib/types';

function isTab(value: unknown): value is Tab {
  return typeof value === 'string' && (TABS as string[]).includes(value);
}

export async function POST(request: Request) {
  if (GAME_PAUSED) return jsonError(503, PAUSED_MESSAGE);
  const body = await readJsonObject(request);
  if (!body) return jsonError(400, 'Invalid JSON');

  const session = verifySession(body.token);
  if (!session) return jsonError(401, 'Invalid or expired session');

  if (!isTab(body.game)) return jsonError(400, 'Invalid game');

  try {
    return NextResponse.json(await startRun(session, body.game, Date.now()));
  } catch (err) {
    return errorResponse(err);
  }
}
