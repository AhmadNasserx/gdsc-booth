/**
 * @jest-environment node
 */
import { POST } from '@/app/api/session/route';
import { BUG_POOL } from '@/lib/questions';
import { hashPlayerKey } from '@/lib/names';
import { verifySession } from '@/lib/session';

process.env.SESSION_SECRET = 'a'.repeat(64);

// In-memory tree standing in for the Realtime Database. transaction() follows the real
// semantics: the callback receives the current value and returning undefined aborts the write.
const mockTree: Record<string, unknown> = {};

function mockRead(path: string): unknown {
  let node: unknown = mockTree;
  for (const key of path.split('/')) {
    if (node === null || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[key];
  }
  return node === undefined ? null : node;
}

function mockWrite(path: string, value: unknown): void {
  const keys = path.split('/');
  const last = keys.pop() as string;
  let node = mockTree;
  for (const key of keys) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  if (value === null) delete node[last];
  else node[last] = value;
}

function mockRef(path: string) {
  return {
    get: async () => ({ val: () => mockRead(path) }),
    transaction: async (update: (current: unknown) => unknown) => {
      const next = update(mockRead(path));
      if (next === undefined) return { committed: false };
      mockWrite(path, next);
      return { committed: true };
    },
  };
}

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    ref: (path: string) => mockRef(path),
  },
}));

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const DAY_MS = 172800000;

beforeEach(() => {
  for (const key of Object.keys(mockTree)) delete mockTree[key];
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

describe('POST /api/session: questions', () => {
  it('returns a token and questions package for a valid name', async () => {
    const res = await claim('Ahmad');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.token).toBe('string');
    expect(Array.isArray(data.questions.riddles)).toBe(true);
    expect(data.questions.riddles).toHaveLength(5);
    expect(Array.isArray(data.questions.trivia)).toBe(true);
    expect(data.questions.trivia).toHaveLength(15);
    expect(typeof data.questions.wordleWord).toBe('string');
    expect(typeof data.questions.wordleHint).toBe('string');
  });

  it('returns 5 bug snippets with the client-facing shape', async () => {
    const res = await claim('Ahmad');
    const data = await res.json();
    expect(data.questions.bugs).toHaveLength(5);
    for (const bug of data.questions.bugs) {
      expect(typeof bug.title).toBe('string');
      expect(typeof bug.language).toBe('string');
      expect(typeof bug.explanation).toBe('string');
      expect(Array.isArray(bug.lines)).toBe(true);
      expect(Number.isInteger(bug.answer)).toBe(true);
      expect(bug.answer).toBeLessThan(bug.lines.length);
      expect(BUG_POOL.some((p) => p.title === bug.title && p.answer === bug.answer)).toBe(true);
    }
  });

  it('no longer sends binaryChar', async () => {
    const res = await claim('Ahmad');
    const data = await res.json();
    expect(data.questions).not.toHaveProperty('binaryChar');
  });

  it('each replay is a new session with a new token', async () => {
    const first = await (await claim('Ahmad')).json();
    const second = await (await claim('Ahmad')).json();
    expect(first.token).not.toBe(second.token);
    expect(verifySession(first.token)?.sessionId).not.toBe(verifySession(second.token)?.sessionId);
  });

  it('puts the trimmed name into the token', async () => {
    const data = await (await claim('  Ahmad  ')).json();
    expect(verifySession(data.token)?.name).toBe('Ahmad');
  });
});

describe('POST /api/session: name validation', () => {
  it('returns 400 for empty name', async () => {
    const res = await claim('');
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeRequest({ playerKey: KEY_A }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for name over 30 chars', async () => {
    const res = await claim('A'.repeat(31));
    expect(res.status).toBe(400);
  });

  it('returns 400 for name with HTML special characters', async () => {
    const res = await claim('<script>xss</script>');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a name that normalizes to nothing', async () => {
    const res = await claim('ÀÀ');
    expect(res.status).toBe(400);
    expect(mockRead('names')).toBeNull();
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
    expect(mockRead('names/ahmad')).toBeNull();
  });

  it('stores only the hash of the player key', async () => {
    await claim('Ahmad');
    const entry = mockRead('names/ahmad') as Record<string, unknown>;
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
    const entry = mockRead('names/ahmad') as { expiresAt: number };
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(entry.expiresAt).toBeLessThanOrEqual(Date.now() + DAY_MS);
  });

  it('lets the same key reclaim its own unexpired name and refreshes expiresAt', async () => {
    const soon = Date.now() + 1000;
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: soon });

    const before = Date.now();
    const res = await claim('Ahmad', KEY_A);
    expect(res.status).toBe(200);
    expect((await res.json()).token).toEqual(expect.any(String));
    const entry = mockRead('names/ahmad') as { expiresAt: number; claimedAt: number };
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(entry.claimedAt).toBeGreaterThanOrEqual(before);
  });

  it('refuses a different key for an unexpired name with 409 and keeps the original claim', async () => {
    await claim('Ahmad', KEY_A);
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Display name already taken. Choose another.' });
    expect(mockRead('names/ahmad')).toMatchObject({ keyHash: hashPlayerKey(KEY_A) });
  });

  it('treats names that normalize to the same key as the same name', async () => {
    await claim('Ahmad Nasser', KEY_A);
    const res = await claim('ahmad   NASSER', KEY_B);
    expect(res.status).toBe(409);
  });

  it('refuses a different key for an unexpired legacy claim without a keyHash', async () => {
    mockWrite('names/ahmad', { claimedAt: 1, expiresAt: Date.now() + DAY_MS });
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(409);
  });

  it('lets another key take a name once its claim has expired', async () => {
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: Date.now() - 1 });
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(200);
    expect(mockRead('names/ahmad')).toMatchObject({ keyHash: hashPlayerKey(KEY_B) });
  });
});
