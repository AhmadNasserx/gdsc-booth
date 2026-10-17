/**
 * @jest-environment node
 */
import { POST } from '@/app/api/leaderboard/route';
import { clock, installClock, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

const PIN = '4821';

beforeEach(() => {
  resetDb();
  installClock();
  process.env.LEADERBOARD_PIN = PIN;
});

afterEach(() => {
  jest.useRealTimers();
});

function GET(...args: [pin?: unknown]) {
  const pin = args.length ? args[0] : PIN;
  return POST(
    new Request('http://localhost/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    }),
  );
}

describe('POST /api/leaderboard: the PIN', () => {
  beforeEach(() => {
    writePath('leaderboard/ahmad', { name: 'Ahmad', score: 10, games: { riddles: 10 }, timestamp: 1, expiresAt: clock.now + 1000 });
  });

  it.each([['wrong PIN', '0000'], ['missing PIN', undefined], ['non-string PIN', 4821], ['empty PIN', '']])(
    'is refused with 403 and no scores for a %s',
    async (_label, pin) => {
      const res = await GET(pin);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Wrong PIN' });
    },
  );

  it('stays hidden when no PIN is configured, even for an empty PIN', async () => {
    delete process.env.LEADERBOARD_PIN;
    expect((await GET('')).status).toBe(403);
    expect((await GET('anything')).status).toBe(403);
  });

  it('refuses a plain GET, so the board cannot be read from a URL', async () => {
    const route = await import('@/app/api/leaderboard/route');
    expect((route as Record<string, unknown>).GET).toBeUndefined();
  });

  it('rejects a body that is not JSON with 400', async () => {
    const res = await POST(new Request('http://localhost/api/leaderboard', { method: 'POST', body: '{' }));
    expect(res.status).toBe(400);
  });

  it('returns the scores for the right PIN', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe('POST /api/leaderboard', () => {
  it('returns an empty list when nobody has scored', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns live entries with their bests and timestamps, and leaves out expired ones', async () => {
    writePath('leaderboard/ahmad', {
      name: 'Ahmad',
      score: 1500,
      games: { riddles: 500, memory: 1000 },
      timestamp: 111,
      expiresAt: clock.now + 1000,
    });
    writePath('leaderboard/old', { name: 'Old', score: 9000, games: { memory: 9000 }, timestamp: 1, expiresAt: clock.now - 1 });

    const entries = await (await GET()).json();
    expect(entries).toEqual([
      { name: 'Ahmad', score: 1500, games: { riddles: 500, memory: 1000 }, timestamp: 111, expiresAt: clock.now + 1000 },
    ]);
  });

  it('never includes a per-game maximum', async () => {
    writePath('leaderboard/ahmad', { name: 'Ahmad', score: 10, games: { riddles: 10 }, timestamp: 1, expiresAt: clock.now + 1000 });
    const text = JSON.stringify(await (await GET()).json());
    expect(text).not.toMatch(/max|out of|\/1000/i);
  });
});
