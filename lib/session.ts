import { createHash, randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'crypto';
import type { SessionPayload } from './types';

export const SESSION_TTL_MS = 90 * 60 * 1000;

function getKey(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env var not set');
  return createHash('sha256').update(s).digest();
}

/** Issues an encrypted token carrying only the session id, the display name and the issue time. */
export function signSession(name: string): { token: string; sessionId: string } {
  const sessionId = randomUUID();
  const payload: SessionPayload = { sessionId, name, issuedAt: Date.now() };
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.from(JSON.stringify(payload));
  const encrypted = Buffer.concat([cipher.update(pt), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Token layout: iv(12) + authTag(16) + ciphertext — all base64url, no dots
  const token = Buffer.concat([iv, authTag, encrypted]).toString('base64url');
  return { token, sessionId };
}

export function verifySession(token: unknown): SessionPayload | null {
  try {
    if (typeof token !== 'string' || !token) return null;
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < 29) return null; // 12 (iv) + 16 (authTag) + 1 (min ciphertext)
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const key = getKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const pt = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(pt.toString('utf8')) as SessionPayload;
    if (typeof payload.sessionId !== 'string' || typeof payload.name !== 'string' || typeof payload.issuedAt !== 'number') {
      return null;
    }
    if (Date.now() - payload.issuedAt > SESSION_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
