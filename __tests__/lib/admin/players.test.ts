/**
 * @jest-environment node
 */
import { applyGameEdits, parseGameEdits, toAdminPlayer } from '@/lib/admin/players';
import { ROUND_MS } from '@/lib/event';
import type { LeaderboardEntry } from '@/lib/types';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

const NOW = 1_700_000_000_000;
const EXPIRES_AT = NOW + 2 * 24 * 60 * 60 * 1000;

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    name: 'Ahmad',
    score: 1500,
    games: { riddles: 500, memory: 500, trivia: 500 },
    timestamp: 1,
    finishedAt: NOW - 10_000,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function expectNoUndefinedValues(value: object): void {
  expect(Object.values(value).some((v) => v === undefined)).toBe(false);
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

describe('parseGameEdits', () => {
  it.each([
    ['a zero score', { riddles: 0 }],
    ['a score at the 5000 limit', { memory: 5000 }],
  ])('accepts %s', (_label, games) => {
    expect(parseGameEdits(games)).toEqual({ ok: true, edits: games });
  });

  it.each([
    ['null', null],
    ['a string', 'riddles'],
    ['a number', 42],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(parseGameEdits(value)).toEqual({ ok: false, error: 'games must be an object' });
  });

  it('rejects an array', () => {
    expect(parseGameEdits([500])).toEqual({ ok: false, error: 'games must be an object' });
  });

  it('rejects an unknown game key', () => {
    expect(parseGameEdits({ chess: 100 })).toEqual({ ok: false, error: 'Unknown game' });
  });

  it.each([
    ['a fraction', { riddles: 1.5 }],
    ['a negative number', { riddles: -1 }],
    ['a number above 5000', { riddles: 5001 }],
    ['a numeric string', { riddles: '300' }],
    ['NaN', { riddles: Number.NaN }],
  ])('rejects %s', (_label, games) => {
    expect(parseGameEdits(games)).toEqual({ ok: false, error: 'Scores must be whole numbers from 0 to 5000' });
  });

  it('rejects an empty games object', () => {
    expect(parseGameEdits({})).toEqual({ ok: false, error: 'Give at least one score to change' });
  });

  it('treats an undefined score as no change', () => {
    expect(parseGameEdits({ riddles: undefined })).toEqual({
      ok: false,
      error: 'Give at least one score to change',
    });
  });
});

describe('applyGameEdits', () => {
  it('recomputes the score as the sum of the games', () => {
    const result = applyGameEdits(entry(), { riddles: 1000 }, NOW);
    expect(result.score).toBe(2000);
    expect(result.games).toEqual({ riddles: 1000, memory: 500, trivia: 500 });
  });

  it('adds a game the player had not played yet to the total', () => {
    const result = applyGameEdits(entry({ score: 500, games: { riddles: 500 }, finishedAt: undefined }), { memory: 200 }, NOW);
    expect(result.score).toBe(700);
  });

  it('moves the timestamp to now only when the score increases', () => {
    expect(applyGameEdits(entry(), { riddles: 1000 }, NOW).timestamp).toBe(NOW);
    expect(applyGameEdits(entry(), { riddles: 100 }, NOW).timestamp).toBe(1);
    expect(applyGameEdits(entry(), { riddles: 500 }, NOW).timestamp).toBe(1);
  });

  it('sets finishedAt once all three games exist', () => {
    const result = applyGameEdits(entry({ finishedAt: undefined, games: { riddles: 500, memory: 500 } }), { trivia: 1 }, NOW);
    expect(result.finishedAt).toBe(NOW);
  });

  it('never moves an existing finishedAt', () => {
    const original = NOW - 10_000;
    const result = applyGameEdits(entry({ finishedAt: original }), { riddles: 1000 }, NOW);
    expect(result.finishedAt).toBe(original);
  });

  it('leaves finishedAt out for a player with only two games', () => {
    const result = applyGameEdits(entry({ finishedAt: undefined, games: { riddles: 500 } }), { memory: 500 }, NOW);
    expect(result).not.toHaveProperty('finishedAt');
  });

  it('leaves expiresAt untouched', () => {
    expect(applyGameEdits(entry(), { riddles: 1000 }, NOW).expiresAt).toBe(EXPIRES_AT);
  });

  it('keeps no undefined values, so the database accepts the result', () => {
    expectNoUndefinedValues(applyGameEdits(entry({ finishedAt: undefined, games: { riddles: 500 } }), { memory: 1 }, NOW));
    expectNoUndefinedValues(applyGameEdits(entry(), { riddles: 1 }, NOW));
  });
});

describe('toAdminPlayer', () => {
  const startedAt = NOW;

  it('describes a finished player with the hour they finished in', () => {
    const finishedAt = startedAt + 2 * ROUND_MS + 5;
    const player = toAdminPlayer('ahmad', entry({ finishedAt }), startedAt);
    expect(player).toEqual({
      key: 'ahmad',
      name: 'Ahmad',
      score: 1500,
      games: { riddles: 500, memory: 500, trivia: 500 },
      gamesPlayed: 3,
      finished: true,
      finishedAt,
      finishedRound: 3,
      timestamp: 1,
    });
  });

  it('describes a player still playing with no finish', () => {
    const player = toAdminPlayer(
      'sara',
      entry({ name: 'Sara', score: 1000, games: { riddles: 500, memory: 0 }, finishedAt: undefined }),
      startedAt,
    );
    expect(player).toMatchObject({
      gamesPlayed: 2,
      finished: false,
      finishedAt: null,
      finishedRound: null,
    });
  });

  it('gives no finished hour before the event has started', () => {
    const player = toAdminPlayer('ahmad', entry(), null);
    expect(player.finished).toBe(true);
    expect(player.finishedRound).toBeNull();
  });
});
