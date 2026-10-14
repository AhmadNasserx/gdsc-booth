/**
 * @jest-environment node
 */
import { POST } from '@/app/api/game/start/route';
import { signSession, verifySession } from '@/lib/session';
import { RIDDLE_POOL, TRIVIA_POOL, BUG_POOL, WORDLE_POOL } from '@/lib/questions';
import { CONTENT_COUNT } from '@/lib/runs/content';
import { TABS, type Tab } from '@/lib/types';
import { clock, installClock, readPath, resetDb, simulateCacheMisses, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);

beforeEach(() => {
  resetDb();
  installClock();
  simulateCacheMisses(false);
});

function token(name = 'Ahmad'): string {
  return signSession(name).token;
}

function start(body: unknown) {
  return POST(
    new Request('http://localhost/api/game/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

async function startGame(game: Tab, t = token()) {
  const res = await start({ token: t, game });
  expect(res.status).toBe(200);
  return (await res.json()) as { runId: string; view: Record<string, unknown> };
}

describe('POST /api/game/start: basics', () => {
  it.each(TABS)('starts a %s run and returns a runId and a view', async (game) => {
    const data = await startGame(game);
    expect(data.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.view.game).toBe(game);
  });

  it('rejects an invalid or expired token with 401', async () => {
    const res = await start({ token: 'nope', game: 'riddles' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid or expired session' });
  });

  it('rejects a missing token with 401', async () => {
    expect((await start({ game: 'riddles' })).status).toBe(401);
  });

  it('rejects an unknown game with 400', async () => {
    const res = await start({ token: token(), game: 'chess' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid game' });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await start('{not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  it('rejects an expired session token with 401', async () => {
    const t = token();
    clock.now += 91 * 60 * 1000;
    expect((await start({ token: t, game: 'password' })).status).toBe(401);
  });

  it('stores a run with a 2 hour expiry, a pointer to it, and the player name', async () => {
    const data = await startGame('wordle');
    const run = readPath(`runs/${data.runId}`) as Record<string, unknown>;
    expect(run).toMatchObject({
      game: 'wordle',
      name: 'Ahmad',
      normKey: 'ahmad',
      status: 'active',
      startedAt: clock.now,
      lastActionAt: clock.now,
      expiresAt: clock.now + 2 * 60 * 60 * 1000,
    });
  });
});

describe('POST /api/game/start: nothing secret before the player acts', () => {
  it('riddles view has the riddles and options but no answer field', async () => {
    const data = await startGame('riddles');
    const questions = data.view.questions as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(5);
    for (const q of questions) expect(Object.keys(q).sort()).toEqual(['emojis', 'hint', 'options']);
    expect(JSON.stringify(data)).not.toContain('"answer"');
    expect(JSON.stringify(data)).not.toContain('"correctAnswer"');
  });

  it('trivia view has questions and options but no answer field', async () => {
    const data = await startGame('trivia');
    const questions = data.view.questions as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(15);
    for (const q of questions) expect(Object.keys(q).sort()).toEqual(['options', 'question']);
    expect(JSON.stringify(data)).not.toContain('"answer"');
  });

  it('bugs view has the snippets but no line answer or explanation', async () => {
    const data = await startGame('bugs');
    const questions = data.view.questions as Array<Record<string, unknown>>;
    expect(questions).toHaveLength(5);
    for (const q of questions) expect(Object.keys(q).sort()).toEqual(['language', 'lines', 'title']);
    expect(JSON.stringify(data)).not.toContain('"answer"');
    expect(JSON.stringify(data)).not.toContain('explanation');
  });

  it('wordle response does not contain the word or the hint', async () => {
    for (let i = 0; i < 20; i++) {
      resetDb();
      const data = await startGame('wordle');
      const run = readPath(`runs/${data.runId}`) as { state: { word: string; hint: string } };
      const json = JSON.stringify(data);
      expect(json).not.toContain(run.state.word);
      expect(json).not.toContain(run.state.word.toLowerCase());
      expect(json).not.toContain(run.state.hint);
      expect(data).toEqual({ runId: data.runId, view: { game: 'wordle' } });
    }
  });

  it('memory response does not contain any face of the layout', async () => {
    const data = await startGame('memory');
    const run = readPath(`runs/${data.runId}`) as { state: { layout: string[] } };
    expect(data.view).toEqual({ game: 'memory', cards: 16 });
    for (const face of new Set(run.state.layout)) {
      expect(JSON.stringify(data)).not.toContain(face);
    }
  });

  it('password response carries no content at all', async () => {
    const data = await startGame('password');
    expect(data).toEqual({ runId: data.runId, view: { game: 'password' } });
  });

  it('a stored wordle word is always one of the pool words', async () => {
    const data = await startGame('wordle');
    const run = readPath(`runs/${data.runId}`) as { state: { word: string } };
    expect(WORDLE_POOL.map((w) => w.word)).toContain(run.state.word);
  });

  it('riddle, trivia and bug content comes from the pools', async () => {
    const riddles = await startGame('riddles');
    const trivia = await startGame('trivia');
    const bugs = await startGame('bugs');
    expect((readPath(`runs/${riddles.runId}`) as { state: { indices: number[] } }).state.indices.every((i) => i < RIDDLE_POOL.length)).toBe(true);
    expect((readPath(`runs/${trivia.runId}`) as { state: { indices: number[] } }).state.indices.every((i) => i < TRIVIA_POOL.length)).toBe(true);
    expect((readPath(`runs/${bugs.runId}`) as { state: { indices: number[] } }).state.indices.every((i) => i < BUG_POOL.length)).toBe(true);
  });
});

describe('POST /api/game/start: replacing runs', () => {
  it('starting a game again abandons the previous run of the same game', async () => {
    const t = token();
    const first = await startGame('riddles', t);
    const second = await startGame('riddles', t);
    expect(first.runId).not.toBe(second.runId);
    expect(readPath(`runs/${first.runId}`)).toMatchObject({ status: 'abandoned' });
    expect(readPath(`runs/${second.runId}`)).toMatchObject({ status: 'active' });
    expect(readPath(`runs-active/${verifySession(t)?.sessionId}_riddles`)).toBe(second.runId);
  });

  it('a different game in the same session keeps its own run', async () => {
    const t = token();
    const riddles = await startGame('riddles', t);
    await startGame('bugs', t);
    expect(readPath(`runs/${riddles.runId}`)).toMatchObject({ status: 'active' });
  });

  it('a different session does not abandon this session\'s run', async () => {
    const first = await startGame('memory', token());
    await startGame('memory', token('Someone Else'));
    expect(readPath(`runs/${first.runId}`)).toMatchObject({ status: 'active' });
  });

  it('abandons the previous run even when the pointer read starts from a cache miss', async () => {
    const t = token();
    const first = await startGame('wordle', t);
    simulateCacheMisses(true);
    const second = await startGame('wordle', t);
    expect(readPath(`runs/${first.runId}`)).toMatchObject({ status: 'abandoned' });
    expect(readPath(`runs/${second.runId}`)).toMatchObject({ status: 'active' });
  });

  it('each start draws fresh content', async () => {
    const t = token();
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const data = await startGame('memory', t);
      const run = readPath(`runs/${data.runId}`) as { state: { layout: string[] } };
      seen.add(run.state.layout.join(''));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('POST /api/game/start: settling a predecessor', () => {
  it('records a finished run that never reached the leaderboard when the next game of that kind starts', async () => {
    const t = token();
    const first = await startGame('password', t);
    writePath(`runs/${first.runId}`, {
      ...(readPath(`runs/${first.runId}`) as object),
      status: 'done',
      final: { score: 640, durationMs: 2000, response: { score: 128 }, settled: false },
    });
    expect(readPath('leaderboard/ahmad')).toBeNull();

    await startGame('password', t);
    expect(readPath('leaderboard/ahmad')).toMatchObject({ score: 640, games: { password: 640 } });
    expect(readPath(`runs/${first.runId}/final/settled`)).toBe(true);
  });

  it('leaves a finished, already settled run alone', async () => {
    const t = token();
    const first = await startGame('password', t);
    writePath(`runs/${first.runId}`, {
      ...(readPath(`runs/${first.runId}`) as object),
      status: 'done',
      final: { score: 640, durationMs: 2000, response: { score: 128 }, settled: true },
    });
    await startGame('password', t);
    expect(readPath('leaderboard/ahmad')).toBeNull();
    expect(readPath(`runs/${first.runId}`)).toMatchObject({ status: 'done' });
  });
});

describe('POST /api/game/start: no repeats per player', () => {
  const sizes = {
    riddles: RIDDLE_POOL.length,
    trivia: TRIVIA_POOL.length,
    bugs: BUG_POOL.length,
    wordle: WORDLE_POOL.length,
  } as const;

  /** The pool indices (or words) that a start handed out, read back from the stored run. */
  function servedBy(runId: string, game: 'riddles' | 'trivia' | 'bugs' | 'wordle'): Array<number | string> {
    const state = (readPath(`runs/${runId}`) as { state: Record<string, unknown> }).state;
    if (game === 'wordle') return [state.word as string];
    return state.indices as number[];
  }

  function seenFor(name: string, game: string): Array<number | string> {
    return ((readPath(`seen/${name}/${game}`) as { served?: Array<number | string> } | null)?.served ?? []) as Array<number | string>;
  }

  it.each(['riddles', 'trivia', 'bugs', 'wordle'] as const)(
    'consecutive %s starts never repeat until the pool is used up, then reset',
    async (game) => {
      const t = token('Ahmad');
      const perStart = game === 'wordle' ? 1 : CONTENT_COUNT[game];
      const pool = sizes[game];
      const fullStarts = Math.floor(pool / perStart);
      const seen = new Set<number | string>();

      for (let i = 0; i < fullStarts; i++) {
        const data = await startGame(game, t);
        for (const k of servedBy(data.runId, game)) {
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
        clock.now += 1000;
      }
      expect(seen.size).toBe(fullStarts * perStart);

      // Next start: the leftovers come first, then the rest comes from what has been served
      const leftover = pool - seen.size;
      const next = await startGame(game, t);
      const nextKeys = servedBy(next.runId, game);
      expect(new Set(nextKeys).size).toBe(perStart);
      if (leftover > 0) {
        expect(nextKeys.filter((k) => !seen.has(k))).toHaveLength(leftover);
      }
      // The served list resets to exactly what was handed out now
      expect([...seenFor('ahmad', game)].sort()).toEqual([...nextKeys].sort());
    },
  );

  it('records the served keys with a 48 hour expiry that each start refreshes', async () => {
    const t = token('Ahmad');
    await startGame('bugs', t);
    const first = readPath('seen/ahmad/bugs') as { expiresAt: number };
    expect(first.expiresAt).toBe(clock.now + 48 * 60 * 60 * 1000);
    clock.now += 60_000;
    await startGame('bugs', t);
    const second = readPath('seen/ahmad/bugs') as { expiresAt: number; served: number[] };
    expect(second.expiresAt).toBe(clock.now + 48 * 60 * 60 * 1000);
    expect(second.served).toHaveLength(10);
  });

  it('an expired record counts as nothing served', async () => {
    const all = Array.from({ length: RIDDLE_POOL.length }, (_, i) => i);
    writePath('seen/ahmad/riddles', { served: all, expiresAt: clock.now - 1 });
    const data = await startGame('riddles', token('Ahmad'));
    const keys = servedBy(data.runId, 'riddles');
    expect(new Set(keys).size).toBe(CONTENT_COUNT.riddles);
    expect([...seenFor('ahmad', 'riddles')].sort((a, b) => (a as number) - (b as number))).toEqual([...keys].sort((a, b) => (a as number) - (b as number)));
  });

  it('players are independent: one player exhausting a pool does not affect another', async () => {
    const ahmad = token('Ahmad');
    const bilal = token('Bilal');
    for (let i = 0; i < 4; i++) await startGame('riddles', ahmad);
    expect(seenFor('ahmad', 'riddles')).toHaveLength(20);

    const first = await startGame('riddles', bilal);
    expect(seenFor('bilal', 'riddles')).toHaveLength(5);
    expect(new Set(servedBy(first.runId, 'riddles')).size).toBe(5);
    expect(seenFor('ahmad', 'riddles')).toHaveLength(20);
  });

  it('two starts at the same moment are given different content', async () => {
    const t = token('Ahmad');
    // Riddles: two starts of 5 from a pool that holds both sets without overlap
    const [a, b] = await Promise.all([startGame('riddles', t), startGame('riddles', t)]);
    const keysA = servedBy(a.runId, 'riddles');
    const keysB = servedBy(b.runId, 'riddles');
    expect(keysA.filter((k) => keysB.includes(k))).toEqual([]);
    expect(new Set(seenFor('ahmad', 'riddles')).size).toBe(10);
  });

  it('stays correct when the first pass of the transaction sees an empty cache', async () => {
    simulateCacheMisses(true);
    const t = token('Ahmad');
    const seen = new Set<number>();
    for (let i = 0; i < 3; i++) {
      const data = await startGame('riddles', t);
      for (const k of servedBy(data.runId, 'riddles')) {
        expect(seen.has(k as number)).toBe(false);
        seen.add(k as number);
      }
    }
    expect(seen.size).toBe(15);
  });

  it('games without a pool (memory, password) leave no seen record', async () => {
    await startGame('memory', token('Ahmad'));
    await startGame('password', token('Ahmad'));
    expect(readPath('seen/ahmad')).toBeNull();
  });
});
