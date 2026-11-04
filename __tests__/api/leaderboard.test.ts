/**
 * @jest-environment node
 */
import { GET } from '@/app/api/leaderboard/route';
import { ROUND_MS } from '@/lib/event';
import { clock, installClock, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

beforeEach(() => {
  resetDb();
  installClock();
});

describe('GET /api/leaderboard', () => {
  it('returns no entries and no rounds before anyone has started', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      entries: [],
      rounds: [],
      event: { startedAt: null, now: clock.now, roundMs: ROUND_MS, currentRound: null, roundEndsAt: null },
    });
  });

  it('returns live entries with their fields, and leaves out expired ones', async () => {
    writePath('leaderboard/ahmad', {
      name: 'Ahmad',
      score: 1500,
      games: { riddles: 500, memory: 0, trivia: 1000 },
      timestamp: 111,
      expiresAt: clock.now + 1000,
    });
    writePath('leaderboard/old', { name: 'Old', score: 9000, games: { memory: 9000 }, timestamp: 1, expiresAt: clock.now - 1 });

    const body = await (await GET()).json();
    expect(body.entries).toEqual([
      { name: 'Ahmad', score: 1500, games: { riddles: 500, memory: 0, trivia: 1000 }, timestamp: 111, expiresAt: clock.now + 1000 },
    ]);
  });

  it('reports the current hour and its end when the event has started', async () => {
    // Three hours in: startedAt is 2 hours and 1 second ago, so hour 3 is running.
    const startedAt = clock.now - 2 * ROUND_MS - 1000;
    writePath('event/startedAt', startedAt);

    const body = await (await GET()).json();
    expect(body.event).toEqual({
      startedAt,
      now: clock.now,
      roundMs: ROUND_MS,
      currentRound: 3,
      roundEndsAt: startedAt + 3 * ROUND_MS,
    });
    expect(body.rounds).toHaveLength(3);
    body.rounds.forEach((round: { round: number; start: number; end: number }, i: number) => {
      expect(round).toMatchObject({
        round: i + 1,
        start: startedAt + i * ROUND_MS,
        end: startedAt + (i + 1) * ROUND_MS,
      });
    });
  });

  it('lists only finished players in each hour top, with exactly name, score and rank', async () => {
    const startedAt = clock.now - ROUND_MS - 1000; // hour 2 is running
    writePath('event/startedAt', startedAt);
    // Still playing: highest score, no finishedAt, so no hour can list them.
    writePath('leaderboard/still', {
      name: 'Still',
      score: 3000,
      games: { riddles: 1000, memory: 1000, trivia: 1000 },
      timestamp: 1,
      expiresAt: clock.now + 1000,
    });
    // Finished in hour 2.
    writePath('leaderboard/done', {
      name: 'Done',
      score: 2000,
      games: { riddles: 600, memory: 700, trivia: 700 },
      timestamp: 2,
      finishedAt: startedAt + ROUND_MS + 5,
      expiresAt: clock.now + 1000,
    });

    const body = await (await GET()).json();
    expect(body.rounds[0].top).toEqual([]);
    expect(body.rounds[1].top).toEqual([{ name: 'Done', score: 2000, rank: 1 }]);
    for (const round of body.rounds) {
      for (const top of round.top) {
        expect(Object.keys(top).sort()).toEqual(['name', 'rank', 'score']);
      }
    }
  });

  it('never returns phone numbers', async () => {
    writePath('event/startedAt', clock.now - 1000);
    writePath('contacts/ahmad', { name: 'Ahmad', phone: '+96170111222', consent: true, expiresAt: clock.now + 1000 });
    writePath('leaderboard/ahmad', { name: 'Ahmad', score: 10, games: { riddles: 10 }, timestamp: 1, expiresAt: clock.now + 1000 });

    const text = JSON.stringify(await (await GET()).json());
    expect(text).not.toContain('96170111222');
    expect(text).not.toContain('70111222');
  });

  it('is marked no-store', async () => {
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('never includes a per-game maximum', async () => {
    writePath('event/startedAt', clock.now - 1000);
    writePath('leaderboard/ahmad', {
      name: 'Ahmad',
      score: 10,
      games: { riddles: 10 },
      timestamp: 1,
      finishedAt: clock.now - 500,
      expiresAt: clock.now + 1000,
    });
    const text = JSON.stringify(await (await GET()).json());
    expect(text).not.toMatch(/max|out of|\/1000/i);
  });
});
