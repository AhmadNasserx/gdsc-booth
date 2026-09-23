import { signSession, verifySession } from '@/lib/session';

process.env.SESSION_SECRET = 'a'.repeat(64);

describe('signSession', () => {
  it('returns a token string and sessionId', () => {
    const { token, sessionId } = signSession('Ahmad', { riddleIndices: [0,1,2,3], triviaIndices: [0,1,2], binaryChar: 'A' });
    expect(typeof token).toBe('string');
    expect(token).toContain('.');
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
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(verifySession(tampered)).toBeNull();
  });

  it('returns null for expired token', () => {
    const { token } = signSession('Ahmad', { riddleIndices: [0,1,2,3], triviaIndices: [0,1,2], binaryChar: 'A' });
    const [encoded] = token.split('.');
    const old = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    old.issuedAt = Date.now() - 31 * 60 * 1000;
    const { createHmac } = require('crypto');
    const newEncoded = Buffer.from(JSON.stringify(old)).toString('base64url');
    const newSig = createHmac('sha256', process.env.SESSION_SECRET!)
      .update(newEncoded)
      .digest('base64url');
    expect(verifySession(`${newEncoded}.${newSig}`)).toBeNull();
  });

  it('returns null for malformed token', () => {
    expect(verifySession('notavalidtoken')).toBeNull();
    expect(verifySession('')).toBeNull();
  });
});
