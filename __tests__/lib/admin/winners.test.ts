/**
 * @jest-environment node
 */
import {
  buildWinnerRounds,
  readWinnerRounds,
  setPrizeGiven,
  type Contact,
  type PrizeRecord,
} from '@/lib/admin/winners';
import { ROUND_MS } from '@/lib/event';
import type { LeaderboardEntry } from '@/lib/types';
import { clock, installClock, readPath, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

const DAY = 24 * ROUND_MS;
const START = 1_700_000_000_000;
const FAR_FUTURE = START + 3 * DAY;

/** A player who has finished all three games at finishedAt. */
function finished(name: string, score: number, finishedAt: number, overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    name,
    score,
    games: { riddles: score, memory: 0, trivia: 0 },
    timestamp: 1,
    finishedAt,
    expiresAt: FAR_FUTURE,
    ...overrides,
  };
}

function contact(name: string, phone: string, expiresAt = FAR_FUTURE): Contact {
  return { name, phone, consentAt: START, expiresAt };
}

/** Hour 1 starts at START. Hour n runs from START + (n - 1) hours. */
const hourAt = (n: number, offsetMs = 1000): number => START + (n - 1) * ROUND_MS + offsetMs;

describe('buildWinnerRounds', () => {
  it('returns no rounds before the event starts', () => {
    const rounds = buildWinnerRounds({
      startedAt: null,
      now: START + 3 * ROUND_MS,
      entries: { ann: finished('Ann', 900, hourAt(1)) },
      contacts: {},
      prizes: {},
    });
    expect(rounds).toEqual([]);
  });

  it('lists the top three of each hour, ranked 1 to 3, from players who finished in that hour', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + 2 * ROUND_MS + 1,
      entries: {
        ann: finished('Ann', 900, hourAt(1)),
        bob: finished('Bob', 800, hourAt(1, 2000)),
        cy: finished('Cy', 700, hourAt(1, 3000)),
        dee: finished('Dee', 600, hourAt(1, 4000)),
        eve: finished('Eve', 500, hourAt(2)),
      },
      contacts: {},
      prizes: {},
    });

    expect(rounds).toHaveLength(3);
    expect(rounds[0].winners.map((w) => [w.name, w.rank, w.score])).toEqual([
      ['Ann', 1, 900],
      ['Bob', 2, 800],
      ['Cy', 3, 700],
    ]);
    expect(rounds[1].winners.map((w) => [w.name, w.rank])).toEqual([['Eve', 1]]);
    expect(rounds[2].winners).toEqual([]);
  });

  it('excludes a player still playing, and one with only two games', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + ROUND_MS + 1,
      entries: {
        still: { name: 'Still', score: 3000, games: { riddles: 1000, memory: 1000, trivia: 1000 }, timestamp: 1, expiresAt: FAR_FUTURE },
        two: {
          name: 'Two',
          score: 2000,
          games: { riddles: 1000, memory: 1000 },
          timestamp: 1,
          finishedAt: hourAt(1),
          expiresAt: FAR_FUTURE,
        },
        ann: finished('Ann', 900, hourAt(1)),
      },
      contacts: {},
      prizes: {},
    });
    expect(rounds[0].winners.map((w) => w.name)).toEqual(['Ann']);
  });

  it('excludes expired entries', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + ROUND_MS + 1,
      entries: {
        old: finished('Old', 5000, hourAt(1), { expiresAt: START + ROUND_MS }),
        ann: finished('Ann', 900, hourAt(1)),
      },
      contacts: {},
      prizes: {},
    });
    expect(rounds[0].winners.map((w) => w.name)).toEqual(['Ann']);
  });

  it('takes the phone from the contact keyed by normKey', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + ROUND_MS + 1,
      entries: { ann: finished('Ann', 900, hourAt(1)) },
      contacts: { ann: contact('Ann', '+96170111222') },
      prizes: {},
    });
    expect(rounds[0].winners[0]).toMatchObject({ normKey: 'ann', phone: '+96170111222' });
  });

  it('gives a null phone for an expired contact', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + ROUND_MS + 1,
      entries: { ann: finished('Ann', 900, hourAt(1)) },
      contacts: { ann: contact('Ann', '+96170111222', START + 1) },
      prizes: {},
    });
    expect(rounds[0].winners[0].phone).toBeNull();
  });

  it('gives a null phone when there is no contact', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + ROUND_MS + 1,
      entries: { ann: finished('Ann', 900, hourAt(1)) },
      contacts: {},
      prizes: {},
    });
    expect(rounds[0].winners[0].phone).toBeNull();
  });

  it('marks a prize given only when prizes[round][normKey] exists, with its givenAt', () => {
    const givenAt = START + ROUND_MS + 60_000;
    const prizes: Record<string, Record<string, PrizeRecord>> = { '1': { ann: { givenAt } } };
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + 2 * ROUND_MS,
      entries: { ann: finished('Ann', 900, hourAt(1)), bob: finished('Bob', 800, hourAt(1, 2000)) },
      contacts: {},
      prizes,
    });
    expect(rounds[0].winners[0]).toMatchObject({ name: 'Ann', prizeGiven: true, prizeGivenAt: givenAt });
    expect(rounds[0].winners[1]).toMatchObject({ name: 'Bob', prizeGiven: false, prizeGivenAt: null });
  });

  it('marks only the running hour as current, with round windows from the start', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + 2 * ROUND_MS + 1,
      entries: {},
      contacts: {},
      prizes: {},
    });
    expect(rounds.map((r) => r.current)).toEqual([false, false, true]);
    rounds.forEach((round, i) => {
      expect(round.round).toBe(i + 1);
      expect(round.start).toBe(START + i * ROUND_MS);
      expect(round.end).toBe(START + (i + 1) * ROUND_MS);
    });
  });

  it('does not put a non-winner phone in the output', () => {
    const rounds = buildWinnerRounds({
      startedAt: START,
      now: START + ROUND_MS + 1,
      entries: {
        ann: finished('Ann', 900, hourAt(1)),
        bob: finished('Bob', 800, hourAt(1, 2000)),
        cy: finished('Cy', 700, hourAt(1, 3000)),
        dee: finished('Dee', 100, hourAt(1, 4000)),
      },
      contacts: { dee: contact('Dee', '+96171333444') },
      prizes: {},
    });
    // Dee finished fourth in hour 1, so she is not a winner and her phone must not appear.
    expect(rounds[0].winners.map((w) => w.name)).toEqual(['Ann', 'Bob', 'Cy']);
    expect(JSON.stringify(rounds)).not.toContain('71333444');
  });
});

describe('readWinnerRounds and setPrizeGiven', () => {
  beforeEach(() => {
    resetDb();
    clock.now = START + ROUND_MS + 1000;
    installClock();
  });

  function seedEvent(): void {
    writePath('event/startedAt', START);
    writePath('leaderboard/ann', finished('Ann', 900, hourAt(1)));
    writePath('leaderboard/bob', finished('Bob', 800, hourAt(1, 2000)));
    writePath('leaderboard/dee', finished('Dee', 100, hourAt(1, 4000)));
    writePath('contacts/ann', contact('Ann', '+96170111222'));
    writePath('contacts/dee', contact('Dee', '+96171333444'));
  }

  describe('readWinnerRounds', () => {
    it('reads the start and the rounds from the database', async () => {
      seedEvent();
      const result = await readWinnerRounds(clock.now);
      expect(result.startedAt).toBe(START);
      expect(result.rounds.map((r) => r.round)).toEqual([1, 2]);
      expect(result.rounds[0].winners.map((w) => [w.name, w.rank, w.phone])).toEqual([
        ['Ann', 1, '+96170111222'],
        ['Bob', 2, null],
        ['Dee', 3, '+96171333444'],
      ]);
    });

    it('keeps the phone of a non-winner out of the response', async () => {
      seedEvent();
      writePath('leaderboard/extra', finished('Extra', 50, hourAt(1, 5000)));
      writePath('leaderboard/fourth', finished('Fourth', 40, hourAt(1, 6000)));
      writePath('contacts/fourth', contact('Fourth', '+96179998877'));

      const text = JSON.stringify(await readWinnerRounds(clock.now));
      expect(text).not.toContain('79998877');
      expect(text).toContain('96170111222');
    });

    it('returns no rounds before the event starts', async () => {
      const result = await readWinnerRounds(clock.now);
      expect(result).toEqual({ startedAt: null, rounds: [] });
    });
  });

  describe('setPrizeGiven', () => {
    it('answers not-started before the clock starts', async () => {
      writePath('leaderboard/ann', finished('Ann', 900, hourAt(1)));
      expect(await setPrizeGiven(1, 'ann', true, clock.now)).toBe('not-started');
      expect(readPath('prizes')).toBeNull();
    });

    it('answers round-not-reached for a round above the current one, or below one', async () => {
      seedEvent();
      expect(await setPrizeGiven(3, 'ann', true, clock.now)).toBe('round-not-reached');
      expect(await setPrizeGiven(0, 'ann', true, clock.now)).toBe('round-not-reached');
      expect(readPath('prizes')).toBeNull();
    });

    it('answers unknown-player for a missing or expired player', async () => {
      seedEvent();
      writePath('leaderboard/old', finished('Old', 5000, hourAt(1), { expiresAt: clock.now - 1 }));
      expect(await setPrizeGiven(1, 'ghost', true, clock.now)).toBe('unknown-player');
      expect(await setPrizeGiven(1, 'old', true, clock.now)).toBe('unknown-player');
      expect(readPath('prizes')).toBeNull();
    });

    it('answers ok and writes givenAt, which the winners response then shows', async () => {
      seedEvent();
      expect(await setPrizeGiven(1, 'ann', true, clock.now)).toBe('ok');
      expect(readPath('prizes/1/ann')).toEqual({ givenAt: clock.now });

      const winner = (await readWinnerRounds(clock.now)).rounds[0].winners[0];
      expect(winner).toMatchObject({ name: 'Ann', prizeGiven: true, prizeGivenAt: clock.now });
    });

    it('removes the prize when given is false', async () => {
      seedEvent();
      await setPrizeGiven(1, 'ann', true, clock.now);
      expect(await setPrizeGiven(1, 'ann', false, clock.now)).toBe('ok');
      expect(readPath('prizes/1/ann')).toBeNull();
    });

    it.each(['Ann Lee', 'a/b'])(
      'answers unknown-player for the key %s, and makes no database write',
      async (key) => {
        seedEvent();
        expect(await setPrizeGiven(1, key, true, clock.now)).toBe('unknown-player');
        expect(readPath('prizes')).toBeNull();
      },
    );
  });
});
