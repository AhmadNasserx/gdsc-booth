/**
 * @jest-environment node
 */
import { POST } from '@/app/api/session/route';
import { hashPlayerKey } from '@/lib/names';
import { verifySession } from '@/lib/session';
import { readPath, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const DAY_MS = 172800000;

beforeEach(() => {
  resetDb();
});

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function claim(name: string, playerKey: unknown = KEY_A) {
  return POST(makeRequest({ name, playerKey }));
}

describe('POST /api/session: response', () => {
  it('returns only a token, with no questions or answers', async () => {
    const res = await claim('Ahmad');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Object.keys(data)).toEqual(['token']);
    expect(typeof data.token).toBe('string');
  });

  it('puts the trimmed name into the token', async () => {
    const data = await (await claim('  Ahmad  ')).json();
    expect(verifySession(data.token)?.name).toBe('Ahmad');
  });

  it('each new session gets a new token and session id', async () => {
    const first = await (await claim('Ahmad')).json();
    const second = await (await claim('Ahmad')).json();
    expect(first.token).not.toBe(second.token);
    expect(verifySession(first.token)?.sessionId).not.toBe(verifySession(second.token)?.sessionId);
  });
});

describe('POST /api/session: name validation', () => {
  it('returns 400 for empty name', async () => {
    expect((await claim('')).status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeRequest({ playerKey: KEY_A }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for name over 30 chars', async () => {
    expect((await claim('A'.repeat(31))).status).toBe(400);
  });

  it('returns 400 for name with HTML special characters', async () => {
    expect((await claim('<script>xss</script>')).status).toBe(400);
  });

  it('returns 400 for a name that normalizes to nothing', async () => {
    const res = await claim('ÀÀ');
    expect(res.status).toBe(400);
    expect(readPath('names')).toBeNull();
  });
});

describe('POST /api/session: player key', () => {
  it('returns 400 "Invalid player key" when playerKey is missing', async () => {
    const res = await POST(makeRequest({ name: 'Ahmad' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid player key' });
  });

  it.each([
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['uppercase hex', 'A'.repeat(64)],
    ['non-hex characters', 'g'.repeat(64)],
    ['a number', 12345],
    ['null', null],
    ['an empty string', ''],
  ])('returns 400 "Invalid player key" for %s', async (_label, playerKey) => {
    const res = await claim('Ahmad', playerKey);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid player key' });
    expect(readPath('names/ahmad')).toBeNull();
  });

  it('stores only the hash of the player key', async () => {
    await claim('Ahmad');
    const entry = readPath('names/ahmad') as Record<string, unknown>;
    expect(entry).toMatchObject({
      keyHash: hashPlayerKey(KEY_A),
      claimedAt: expect.any(Number),
      expiresAt: expect.any(Number),
    });
    expect(JSON.stringify(entry)).not.toContain(KEY_A);
  });

  it('sets the claim to expire two days from now', async () => {
    const before = Date.now();
    await claim('Ahmad');
    const entry = readPath('names/ahmad') as { expiresAt: number };
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(entry.expiresAt).toBeLessThanOrEqual(Date.now() + DAY_MS);
  });

  it('lets the same key reclaim its own unexpired name and refreshes expiresAt', async () => {
    const soon = Date.now() + 1000;
    writePath('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: soon });

    const before = Date.now();
    const res = await claim('Ahmad', KEY_A);
    expect(res.status).toBe(200);
    expect((await res.json()).token).toEqual(expect.any(String));
    const entry = readPath('names/ahmad') as { expiresAt: number; claimedAt: number };
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(entry.claimedAt).toBeGreaterThanOrEqual(before);
  });

  it('refuses a different key for an unexpired name with 409 and keeps the original claim', async () => {
    await claim('Ahmad', KEY_A);
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Display name already taken. Choose another.' });
    expect(readPath('names/ahmad')).toMatchObject({ keyHash: hashPlayerKey(KEY_A) });
  });

  it('treats names that normalize to the same key as the same name', async () => {
    await claim('Ahmad Nasser', KEY_A);
    const res = await claim('ahmad   NASSER', KEY_B);
    expect(res.status).toBe(409);
  });

  it('refuses a different key for an unexpired legacy claim without a keyHash', async () => {
    writePath('names/ahmad', { claimedAt: 1, expiresAt: Date.now() + DAY_MS });
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(409);
  });

  it('lets another key take a name once its claim has expired', async () => {
    writePath('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: Date.now() - 1 });
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(200);
    expect(readPath('names/ahmad')).toMatchObject({ keyHash: hashPlayerKey(KEY_B) });
  });
});
