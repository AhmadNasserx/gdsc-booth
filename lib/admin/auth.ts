import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { NextResponse } from 'next/server';

export const ADMIN_COOKIE = 'admin_session';
export const ADMIN_SESSION_MAX_AGE_S = 8 * 60 * 60;
export const MIN_ADMIN_PASSWORD_LENGTH = 12;
export const LOGIN_FAILURE_DELAY_MS = 400;

const TOKEN_AUDIENCE = 'admin';
const TOKEN_KEY_LABEL = 'gdsc admin session key v1';
/** Tokens issued this far in the future are rejected, to allow for small clock differences. */
const MAX_CLOCK_SKEW_MS = 60 * 1000;

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD as string;
}

/** Digest of the configured password. Stored inside tokens, so changing the password signs everyone out. */
function passwordDigest(): string {
  return sha256Hex(adminPassword());
}

/** True only when both the admin password and the session secret are configured. */
export function adminReady(): boolean {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  return (
    typeof password === 'string' &&
    password.length >= MIN_ADMIN_PASSWORD_LENGTH &&
    typeof secret === 'string' &&
    secret.length > 0
  );
}

/** Compares a login attempt with the configured password. Both sides are hashed, then compared in constant time. */
export function passwordMatches(input: string): boolean {
  if (!adminReady()) return false;
  const given = createHash('sha256').update(input, 'utf8').digest();
  const expected = createHash('sha256').update(adminPassword(), 'utf8').digest();
  return timingSafeEqual(given, expected);
}

/** Key for admin tokens. Derived with HMAC and a label, so it differs from the player session key in lib/session.ts. */
function getTokenKey(): Buffer {
  return createHmac('sha256', process.env.SESSION_SECRET as string)
    .update(TOKEN_KEY_LABEL)
    .digest();
}

/** Issues an encrypted admin token. Layout: iv(12) + authTag(16) + ciphertext, base64url, no dots. */
export function signAdminToken(now: number): string {
  const payload = { aud: TOKEN_AUDIENCE, issuedAt: now, pk: passwordDigest() };
  const key = getTokenKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

/** Checks an admin token: it must decrypt, be for the admin audience, be fresh and match the current password. */
export function verifyAdminToken(token: unknown, now: number): boolean {
  if (typeof token !== 'string' || !token) return false;
  if (!adminReady()) return false;
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < 29) return false; // 12 (iv) + 16 (authTag) + 1 (min ciphertext)
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', getTokenKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>;

    if (!payload || typeof payload !== 'object') return false;
    if (payload.aud !== TOKEN_AUDIENCE) return false;
    if (typeof payload.issuedAt !== 'number') return false;
    if (typeof payload.pk !== 'string') return false;

    const age = now - payload.issuedAt;
    if (age < -MAX_CLOCK_SKEW_MS) return false;
    if (age >= ADMIN_SESSION_MAX_AGE_S * 1000) return false;

    const presented = Buffer.from(payload.pk, 'hex');
    const current = Buffer.from(passwordDigest(), 'hex');
    if (presented.length !== current.length) return false;
    return timingSafeEqual(presented, current);
  } catch {
    return false;
  }
}

function secureSuffix(): string {
  return process.env.NODE_ENV === 'development' ? '' : '; Secure';
}

/** Set-Cookie value that stores the admin token. */
export function adminCookie(token: string): string {
  return `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_MAX_AGE_S}; HttpOnly; SameSite=Strict${secureSuffix()}`;
}

/** Set-Cookie value that removes the admin token. */
export function clearedAdminCookie(): string {
  return `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureSuffix()}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  const prefix = `${name}=`;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return null;
}

/** True when the Origin (or Referer) header names the same host as the request. A literal "null" origin is refused. */
export function sameOrigin(request: Request): boolean {
  const source = request.headers.get('origin') ?? request.headers.get('referer');
  if (!source) return false;
  try {
    return new URL(source).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export type AdminAccess = { ok: true } | { ok: false; response: NextResponse };

function denied(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Guards an admin route: the panel must be configured, the caller must hold a valid token, and state-changing requests must come from this origin. */
export function requireAdmin(request: Request): AdminAccess {
  if (!adminReady()) {
    return { ok: false, response: denied(503, 'Admin is not set up.') };
  }
  const token = readCookie(request, ADMIN_COOKIE);
  if (!verifyAdminToken(token, Date.now())) {
    return { ok: false, response: denied(401, 'Sign in to continue.') };
  }
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) {
    return { ok: false, response: denied(403, 'Request not allowed.') };
  }
  return { ok: true };
}

/** Waits after a failed login so that guessing is slow. */
export function failureDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LOGIN_FAILURE_DELAY_MS));
}
