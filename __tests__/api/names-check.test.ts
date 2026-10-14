/**
 * @jest-environment node
 */
import { GET } from '@/app/api/names/check/route';
import { hashPlayerKey } from '@/lib/names';

// In-memory tree standing in for the Realtime Database
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
  node[last] = value;
}

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    ref: (path: string) => ({
      get: async () => ({ val: () => mockRead(path) }),
    }),
  },
}));

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const FUTURE = () => Date.now() + 60 * 60 * 1000;

beforeEach(() => {
  for (const key of Object.keys(mockTree)) delete mockTree[key];
});

/** Builds a check request. The player key, when given, is sent in the x-player-key header. */
function check(params: Record<string, string>, playerKey?: string) {
  const qs = new URLSearchParams(params).toString();
  const headers: Record<string, string> = {};
  if (playerKey !== undefined) headers['x-player-key'] = playerKey;
  return GET(new Request(`http://localhost/api/names/check?${qs}`, { headers }));
}

async function json(res: Response) {
  return res.json();
}

describe('GET /api/names/check: invalid input', () => {
  it('reports unavailable for a missing name', async () => {
    expect(await json(await check({}))).toEqual({ available: false });
  });

  it('reports unavailable for a name that fails the pattern', async () => {
    expect(await json(await check({ name: '<b>x</b>' }))).toEqual({ available: false });
    expect(await json(await check({ name: 'A' }))).toEqual({ available: false });
  });

  it('reports unavailable for a name that normalizes to nothing', async () => {
    expect(await json(await check({ name: 'ÀÀ' }))).toEqual({ available: false });
  });
});

describe('GET /api/names/check: availability', () => {
  it('reports an unclaimed name as available without mine', async () => {
    expect(await json(await check({ name: 'Ahmad' }, KEY_A))).toEqual({ available: true });
  });

  it('reports a name claimed by another key as taken', async () => {
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: FUTURE() });
    expect(await json(await check({ name: 'Ahmad' }, KEY_B))).toEqual({ available: false });
  });

  it('reports a name claimed by another key as taken when no playerKey is given', async () => {
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: FUTURE() });
    expect(await json(await check({ name: 'Ahmad' }))).toEqual({ available: false });
  });

  it('reports a malformed playerKey as not mine', async () => {
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: FUTURE() });
    expect(await json(await check({ name: 'Ahmad' }, 'not-a-key'))).toEqual({ available: false });
  });

  it('reports an expired claim as available, even for the same key, without mine', async () => {
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: Date.now() - 1 });
    expect(await json(await check({ name: 'Ahmad' }, KEY_A))).toEqual({ available: true });
  });

  it('reports a legacy claim without keyHash as taken', async () => {
    mockWrite('names/ahmad', { claimedAt: 1, expiresAt: FUTURE() });
    expect(await json(await check({ name: 'Ahmad' }, KEY_A))).toEqual({ available: false });
  });
});

describe('GET /api/names/check: mine', () => {
  it('reports the name as available with mine = true for the key that claimed it', async () => {
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: FUTURE() });
    expect(await json(await check({ name: 'Ahmad' }, KEY_A))).toEqual({ available: true, mine: true });
  });

  it('ignores a player key sent in the query string, which is not a supported input', async () => {
    mockWrite('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: FUTURE() });
    const res = await GET(new Request(`http://localhost/api/names/check?name=Ahmad&playerKey=${KEY_A}`));
    expect(await json(res)).toEqual({ available: false });
  });

  it('matches on the normalized name, so casing and spacing do not matter', async () => {
    mockWrite('names/ahmad_nasser', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: FUTURE() });
    expect(await json(await check({ name: 'AHMAD  nasser' }, KEY_A))).toEqual({
      available: true,
      mine: true,
    });
  });
});
