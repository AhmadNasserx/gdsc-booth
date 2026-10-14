/**
 * @jest-environment node
 */
import { applyRunToEntry, computeRank, gamesPlayedOf, isLive, liveEntries, sumBests } from '@/lib/runs/ranking';
import { LEADERBOARD_TTL_MS } from '@/lib/runs/shared';
import type { LeaderboardEntry } from '@/lib/types';

const NOW = 1_700_000_000_000;
const ISSUED = NOW - 1000;

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return { name: 'X', score: 0, timestamp: 1, expiresAt: NOW + 10_000, ...overrides };
}

describe('applyRunToEntry', () => {
  it('creates an entry for a first run that scores', () => {
    const out = applyRunToEntry(null, { name: 'Ahmad', game: 'riddles', score: 700, now: NOW, issuedAt: ISSUED });
    expect(out).toEqual({
      entry: {
        name: 'Ahmad',
        score: 700,
        games: { riddles: 700 },
        timestamp: NOW,
        expiresAt: ISSUED + LEADERBOARD_TTL_MS,
      },
      best: 700,
      improved: true,
    });
  });

  it('a first run that scores nothing is recorded as played but is not an improvement', () => {
    const out = applyRunToEntry(null, { name: 'Ahmad', game: 'wordle', score: 0, now: NOW, issuedAt: ISSUED });
    expect(out.entry.games).toEqual({ wordle: 0 });
    expect(out.entry.score).toBe(0);
    expect(out.improved).toBe(false);
    expect(out.best).toBe(0);
  });

  it('keeps the best per game: a worse run changes nothing but the record of play', () => {
    const current = entry({ score: 700, games: { riddles: 700 }, timestamp: 5, expiresAt: NOW + 10_000 });
    const out = applyRunToEntry(current, { name: 'X', game: 'riddles', score: 300, now: NOW, issuedAt: ISSUED });
    expect(out.best).toBe(700);
    expect(out.improved).toBe(false);
    expect(out.entry.score).toBe(700);
    expect(out.entry.timestamp).toBe(5);
  });

  it('a better run replaces the game best and moves the timestamp to now', () => {
    const current = entry({ score: 700, games: { riddles: 700 }, timestamp: 5 });
    const out = applyRunToEntry(current, { name: 'X', game: 'riddles', score: 900, now: NOW, issuedAt: ISSUED });
    expect(out.best).toBe(900);
    expect(out.improved).toBe(true);
    expect(out.entry).toMatchObject({ score: 900, games: { riddles: 900 }, timestamp: NOW });
  });

  it('adds a new game to the total and moves the timestamp', () => {
    const current = entry({ score: 700, games: { riddles: 700 }, timestamp: 5 });
    const out = applyRunToEntry(current, { name: 'X', game: 'bugs', score: 400, now: NOW, issuedAt: ISSUED });
    expect(out.entry.score).toBe(1100);
    expect(out.entry.games).toEqual({ riddles: 700, bugs: 400 });
    expect(out.entry.timestamp).toBe(NOW);
  });

  it('a zero-point replay of a game with a best does not move the timestamp', () => {
    const current = entry({ score: 700, games: { riddles: 700 }, timestamp: 5 });
    const out = applyRunToEntry(current, { name: 'X', game: 'riddles', score: 0, now: NOW, issuedAt: ISSUED });
    expect(out.entry.timestamp).toBe(5);
  });

  it('an expired entry is treated as absent, so the player starts from zero', () => {
    const stale = entry({ score: 5000, games: { riddles: 1000, bugs: 4000 }, timestamp: 2, expiresAt: NOW - 1 });
    const out = applyRunToEntry(stale, { name: 'X', game: 'memory', score: 300, now: NOW, issuedAt: ISSUED });
    expect(out.entry.games).toEqual({ memory: 300 });
    expect(out.entry.score).toBe(300);
    expect(out.entry.timestamp).toBe(NOW);
  });

  it('never moves expiresAt backwards', () => {
    const later = ISSUED + LEADERBOARD_TTL_MS + 5000;
    const current = entry({ score: 100, games: { riddles: 100 }, expiresAt: later });
    const out = applyRunToEntry(current, { name: 'X', game: 'riddles', score: 200, now: NOW, issuedAt: ISSUED });
    expect(out.entry.expiresAt).toBe(later);
  });

  it('extends expiresAt to issuedAt + 48h when that is later', () => {
    const current = entry({ score: 100, games: { riddles: 100 }, expiresAt: NOW + 1000 });
    const out = applyRunToEntry(current, { name: 'X', game: 'riddles', score: 200, now: NOW, issuedAt: NOW });
    expect(out.entry.expiresAt).toBe(NOW + LEADERBOARD_TTL_MS);
  });
});

describe('computeRank', () => {
  it('is 1 when nobody is ahead', () => {
    expect(computeRank([], NOW, 100, NOW)).toBe(1);
  });

  it('counts every live entry with a higher total', () => {
    const board = [entry({ score: 500 }), entry({ score: 300 }), entry({ score: 900 })];
    expect(computeRank(board, NOW, 400, NOW)).toBe(3);
  });

  it('breaks an equal total by the earlier timestamp', () => {
    const board = [entry({ score: 500, timestamp: 10 }), entry({ score: 500, timestamp: NOW + 10 })];
    expect(computeRank(board, NOW, 500, NOW)).toBe(2);
  });

  it('does not count an equal total with the same timestamp', () => {
    const board = [entry({ score: 500, timestamp: NOW })];
    expect(computeRank(board, NOW, 500, NOW)).toBe(1);
  });

  it('ignores expired entries', () => {
    const board = [entry({ score: 9000, expiresAt: NOW - 1 }), entry({ score: 100 })];
    expect(computeRank(board, NOW, 500, NOW)).toBe(1);
  });

  it('does not count the entry itself when it is in the list', () => {
    const me = entry({ score: 500, timestamp: NOW });
    expect(computeRank([me], NOW, 500, NOW)).toBe(1);
  });
});

describe('helpers', () => {
  it('isLive needs a future expiry', () => {
    expect(isLive(entry({ expiresAt: NOW + 1 }), NOW)).toBe(true);
    expect(isLive(entry({ expiresAt: NOW }), NOW)).toBe(false);
    expect(isLive(null, NOW)).toBe(false);
  });

  it('liveEntries keeps only live entries', () => {
    const kept = liveEntries([entry({ name: 'a' }), entry({ name: 'b', expiresAt: NOW - 1 }), undefined], NOW);
    expect(kept.map((e) => e.name)).toEqual(['a']);
  });

  it('sumBests adds the bests', () => {
    expect(sumBests({ riddles: 100, bugs: 0, memory: 250 })).toBe(350);
    expect(sumBests({})).toBe(0);
  });

  it('gamesPlayedOf lists games in tab order and counts zero bests', () => {
    expect(gamesPlayedOf({ bugs: 0, riddles: 10 })).toEqual(['riddles', 'bugs']);
  });
});
