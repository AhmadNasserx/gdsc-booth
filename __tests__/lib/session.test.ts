/**
 * @jest-environment node
 */
import { signSession, verifySession, SESSION_TTL_MS } from '@/lib/session';

process.env.SESSION_SECRET = 'a'.repeat(64);

const MINUTE = 60 * 1000;

describe('signSession', () => {
  it('returns a token string and sessionId', () => {
    const { token, sessionId } = signSession('Ahmad');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(typeof sessionId).toBe('string');
  });

  it('gives every session a new id and token', () => {
    const a = signSession('Ahmad');
    const b = signSession('Ahmad');
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a.token).not.toBe(b.token);
  });
});

describe('verifySession', () => {
  it('round-trips a valid token', () => {
    const { token, sessionId } = signSession('Ahmad');
    const payload = verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe('Ahmad');
    expect(payload?.sessionId).toBe(sessionId);
    expect(payload?.issuedAt).toEqual(expect.any(Number));
  });

  it('carries only the session id, name and issue time', () => {
    const { token } = signSession('Ahmad');
    expect(Object.keys(verifySession(token) ?? {}).sort()).toEqual(['issuedAt', 'name', 'sessionId']);
  });

  it('returns null for tampered token', () => {
    const { token } = signSession('Ahmad');
    // Flip the last 4 base64url chars — corrupts the ciphertext, fails GCM auth tag
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(verifySession(tampered)).toBeNull();
  });

  it('uses a 90 minute lifetime', () => {
    expect(SESSION_TTL_MS).toBe(90 * MINUTE);
    const { token } = signSession('Ahmad');
    const origNow = Date.now;
    try {
      Date.now = jest.fn(() => origNow() + 89 * MINUTE);
      expect(verifySession(token)).not.toBeNull();
      Date.now = jest.fn(() => origNow() + 91 * MINUTE);
      expect(verifySession(token)).toBeNull();
    } finally {
      Date.now = origNow;
    }
  });

  it('returns null for malformed token', () => {
    expect(verifySession('notavalidtoken')).toBeNull();
    expect(verifySession('')).toBeNull();
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession(42)).toBeNull();
  });
});
