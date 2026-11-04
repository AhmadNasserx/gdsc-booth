import { NextResponse } from 'next/server';

/** JSON reply for the admin API. Admin responses are never cached. */
export function adminJson(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** JSON error reply for the admin API in the { error } shape. */
export function adminError(status: number, message: string, headers?: Record<string, string>): NextResponse {
  return adminJson({ error: message }, status, headers);
}

/** A normalized name key: lowercase letters, digits and underscores, 1 to 30 characters. */
export function isNormKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9_]{1,30}$/.test(value);
}

/** A round (prize hour) number from 1 to 1000. */
export function isRound(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000;
}

/** A game score from 0 to 5000. */
export function isScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5000;
}
