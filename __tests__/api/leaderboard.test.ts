/**
 * @jest-environment node
 */
import { GET } from '@/app/api/leaderboard/route';
import { clock, installClock, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

beforeEach(() => {
  resetDb();
  installClock();
});

describe('GET /api/leaderboard', () => {
  it('returns an empty list when nobody has scored', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns live entries with their bests and timestamps, and leaves out expired ones', async () => {
    writePath('leaderboard/ahmad', {
      name: 'Ahmad',
      score: 1500,
      games: { riddles: 500, password: 1000 },
      timestamp: 111,
      expiresAt: clock.now + 1000,
    });
    writePath('leaderboard/old', { name: 'Old', score: 9000, games: { memory: 9000 }, timestamp: 1, expiresAt: clock.now - 1 });

    const entries = await (await GET()).json();
    expect(entries).toEqual([
      { name: 'Ahmad', score: 1500, games: { riddles: 500, password: 1000 }, timestamp: 111, expiresAt: clock.now + 1000 },
    ]);
  });

  it('never includes a per-game maximum', async () => {
    writePath('leaderboard/ahmad', { name: 'Ahmad', score: 10, games: { riddles: 10 }, timestamp: 1, expiresAt: clock.now + 1000 });
    const text = JSON.stringify(await (await GET()).json());
    expect(text).not.toMatch(/max|out of|\/1000/i);
  });
});
