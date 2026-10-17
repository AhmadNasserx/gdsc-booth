/**
 * @jest-environment node
 */
import { GET } from '@/app/api/cron/cleanup/route';
import { clock, installClock, readPath, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.CRON_SECRET = 'test-cron-secret';

beforeEach(() => {
  resetDb();
  installClock();
});

function makeRequest(auth?: string) {
  return new Request('http://localhost/api/cron/cleanup', {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
}

function seed() {
  const past = clock.now - 1;
  const future = clock.now + 60_000;
  writePath('leaderboard/old', { name: 'Old', score: 100, games: { riddles: 100 }, timestamp: 1, expiresAt: past });
  writePath('leaderboard/new', { name: 'New', score: 200, games: { riddles: 200 }, timestamp: 1, expiresAt: future });
  writePath('names/old', { keyHash: 'x', claimedAt: 1, expiresAt: past });
  writePath('names/new', { keyHash: 'y', claimedAt: 1, expiresAt: future });
  writePath('runs/expired', { sessionId: 's1', game: 'riddles', status: 'done', startedAt: 1, expiresAt: past, state: { indices: [0] } });
  writePath('runs/live', { sessionId: 's2', game: 'riddles', status: 'active', startedAt: 1, expiresAt: future, state: { indices: [0] } });
  writePath('runs-active/s1_riddles', 'expired');
  writePath('runs-active/s2_riddles', 'live');
  writePath('runs-active/s3_trivia', 'gone');
  writePath('seen/old/riddles', { served: [1, 2], expiresAt: past });
  writePath('seen/old/trivia', { served: [3], expiresAt: future });
  writePath('seen/new/riddles', { served: [4], expiresAt: future });
}

describe('GET /api/cron/cleanup', () => {
  it('returns 401 without authorization', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 for the wrong secret', async () => {
    expect((await GET(makeRequest('wrong-secret'))).status).toBe(401);
  });

  it('removes expired leaderboard entries, names and runs, and keeps the live ones', async () => {
    seed();
    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 6 }); // 3 expired records, 1 expired seen record, 2 pointers left dangling

    expect(readPath('leaderboard/old')).toBeNull();
    expect(readPath('leaderboard/new')).not.toBeNull();
    expect(readPath('names/old')).toBeNull();
    expect(readPath('names/new')).not.toBeNull();
    expect(readPath('runs/expired')).toBeNull();
    expect(readPath('runs/live')).not.toBeNull();
  });

  it('removes expired seen records per game and keeps live ones', async () => {
    seed();
    await GET(makeRequest('test-cron-secret'));
    expect(readPath('seen/old/riddles')).toBeNull();
    expect(readPath('seen/old/trivia')).toMatchObject({ served: [3] });
    expect(readPath('seen/new/riddles')).toMatchObject({ served: [4] });
  });

  it('removes active pointers whose run is gone, and keeps the ones that still point at a run', async () => {
    seed();
    await GET(makeRequest('test-cron-secret'));
    expect(readPath('runs-active/s1_riddles')).toBeNull();
    expect(readPath('runs-active/s2_riddles')).toBe('live');
    expect(readPath('runs-active/s3_trivia')).toBeNull();
  });

  it('no longer touches submissions', async () => {
    writePath('submissions/abc', { expiresAt: clock.now - 1 });
    await GET(makeRequest('test-cron-secret'));
    expect(readPath('submissions/abc')).not.toBeNull();
  });
});
