import { signSession, verifySession } from '@/lib/session';

process.env.SESSION_SECRET = 'a'.repeat(64);

describe('signSession', () => {
  it('returns a token string and sessionId', () => {
    const { token, sessionId } = signSession('Ahmad', { riddleIndices: [0,1,2,3], triviaIndices: [0,1,2], binaryChar: 'A' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(typeof sessionId).toBe('string');
  });
});

describe('verifySession', () => {
  it('round-trips a valid token', () => {
    const { token } = signSession('Ahmad', { riddleIndices: [0,1,2,3], triviaIndices: [0,1,2], binaryChar: 'A' });
    const payload = verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe('Ahmad');
    expect(payload?.sessionId).toBeDefined();
  });

  it('returns null for tampered token', () => {
    const { token } = signSession('Ahmad', { riddleIndices: [0,1,2,3], triviaIndices: [0,1,2], binaryChar: 'A' });
    // Flip the last 4 base64url chars — corrupts the ciphertext, fails GCM auth tag
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(verifySession(tampered)).toBeNull();
  });

  it('returns null for expired token', () => {
    const { token } = signSession('Ahmad', { riddleIndices: [0,1,2,3], triviaIndices: [0,1,2], binaryChar: 'A' });
    const origNow = Date.now;
    Date.now = jest.fn(() => origNow() + 31 * 60 * 1000);
    expect(verifySession(token)).toBeNull();
    Date.now = origNow;
  });

  it('returns null for malformed token', () => {
    expect(verifySession('notavalidtoken')).toBeNull();
    expect(verifySession('')).toBeNull();
  });
});
