import { NextResponse } from 'next/server';
import { GAME_PAUSED, PAUSED_MESSAGE } from '@/lib/config';
import { verifySession } from '@/lib/session';
import { performAction } from '@/lib/runs/service';
import { errorResponse, jsonError, readJsonObject } from '@/lib/runs/http';

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request) {
  if (GAME_PAUSED) return jsonError(503, PAUSED_MESSAGE);
  const body = await readJsonObject(request);
  if (!body) return jsonError(400, 'Invalid JSON');

  const session = verifySession(body.token);
  if (!session) return jsonError(401, 'Invalid or expired session');

  // The run id becomes part of a database path, so only a well-formed UUID gets through.
  if (typeof body.runId !== 'string' || !RUN_ID_PATTERN.test(body.runId)) {
    return jsonError(400, 'Invalid run id');
  }

  try {
    return NextResponse.json(await performAction(session, body.runId, body, Date.now()));
  } catch (err) {
    return errorResponse(err);
  }
}
