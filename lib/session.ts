import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { SessionPayload, QuestionsPackage } from './types';

const TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env var not set');
  return s;
}

export function signSession(name: string, questions: QuestionsPackage): { token: string; sessionId: string } {
  const sessionId = randomUUID();
  const payload: SessionPayload = { sessionId, name, issuedAt: Date.now(), questions };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(encoded).digest('base64url');
  return { token: `${encoded}.${sig}`, sessionId };
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', secret()).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    const payload: SessionPayload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
    if (Date.now() - payload.issuedAt > TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
