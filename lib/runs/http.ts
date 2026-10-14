import { NextResponse } from 'next/server';
import { RunError } from './shared';

/** Reads a JSON object body, or returns null when it is missing or not an object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Maps a thrown RunError to its status. Anything unexpected becomes a generic 500. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof RunError) return jsonError(err.status, err.message);
  console.error('Unhandled API error', err);
  return jsonError(500, 'Server error. Try again.');
}
