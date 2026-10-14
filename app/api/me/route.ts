import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { getMe } from '@/lib/runs/service';
import { errorResponse, jsonError, readJsonObject } from '@/lib/runs/http';

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return jsonError(400, 'Invalid JSON');

  const session = verifySession(body.token);
  if (!session) return jsonError(401, 'Invalid or expired session');

  try {
    return NextResponse.json(await getMe(session, Date.now()));
  } catch (err) {
    return errorResponse(err);
  }
}
