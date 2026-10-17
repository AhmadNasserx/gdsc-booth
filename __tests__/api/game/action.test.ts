/**
 * @jest-environment node
 */
import { POST as startPOST } from '@/app/api/game/start/route';
import { POST as actionPOST } from '@/app/api/game/action/route';
import { signSession, verifySession } from '@/lib/session';
import { BUG_POOL, RIDDLE_POOL } from '@/lib/questions';
import { calcRunScore, memoryPerformance } from '@/lib/scoring';
import { TABS, type Tab } from '@/lib/types';
import { adminDbMock, clock, installClock, readPath, resetDb, simulateCacheMisses, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);

const DAY_MS = 48 * 60 * 60 * 1000;
const UUID_NOT_IN_DB = '00000000-0000-4000-8000-000000000000';
const NONE5 = { answers: [null, null, null, null, null] };

beforeEach(() => {
  resetDb();
  installClock();
  simulateCacheMisses(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Response bodies are checked field by field, so a loose type keeps the assertions readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

function json(route: 'start' | 'action', body: unknown, raw = false) {
  const url = `http://localhost/api/game/${route}`;
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  };
  return route === 'start' ? startPOST(new Request(url, init)) : actionPOST(new Request(url, init));
}

async function call(route: 'start' | 'action', body: unknown): Promise<{ status: number; data: Json }> {
  const res = await json(route, body);
  return { status: res.status, data: await res.json() };
}

function login(name = 'Ahmad'): { token: string; sessionId: string; issuedAt: number } {
  const { token } = signSession(name);
  const payload = verifySession(token);
  if (!payload) throw new Error('bad token');
  return { token, sessionId: payload.sessionId, issuedAt: payload.issuedAt };
}

/** Games are played in order, so a later game needs the earlier ones on the board. They are put there with no points. */
function seedEarlier(game: Tab, t: string): void {
  if (TABS.indexOf(game) === 0) return;
  const session = verifySession(t);
  if (!session) throw new Error('bad token');
  const key = session.name.toLowerCase();
  const entry = (readPath(`leaderboard/${key}`) as Json | null) ?? {
    name: session.name,
    score: 0,
    games: {},
    timestamp: clock.now,
    expiresAt: session.issuedAt + DAY_MS,
  };
  const games: Json = { ...(entry.games ?? {}) };
  for (const earlier of TABS.slice(0, TABS.indexOf(game))) games[earlier] ??= 0;
  writePath(`leaderboard/${key}`, { ...entry, games });
}

async function start(game: Tab, t = login().token): Promise<{ runId: string; view: Json }> {
  seedEarlier(game, t);
  const { status, data } = await call('start', { token: t, game });
  expect(status).toBe(200);
  return data as { runId: string; view: Json };
}

function run(runId: string): Json {
  return readPath(`runs/${runId}`) as Json;
}

/** Moves the test clock on so the next action clears the throttle. */
function tick(ms = 400): void {
  clock.now += ms;
}

async function act(t: string, runId: string, body: Json): Promise<{ status: number; data: Json }> {
  return call('action', { token: t, runId, ...body });
}

/** The answers that are right for a riddles run, in the order it asks them. */
function rightRiddles(runId: string, n = 5): string[] {
  return (run(runId).state.indices as number[]).slice(0, n).map((i) => RIDDLE_POOL[i].answer);
}
function wrongBugs(runId: string): number[] {
  return (run(runId).state.indices as number[]).map((i) => (BUG_POOL[i].answer + 1) % BUG_POOL[i].lines.length);
}

/** Records every RTDB call the routes make, by kind and path. */
function trackOps(): string[] {
  const ops: string[] = [];
  const real = adminDbMock.ref;
  jest.spyOn(adminDbMock, 'ref').mockImplementation((path: string) => {
    const ref = real(path);
    return {
      get: () => {
        ops.push(`get ${path}`);
        return ref.get();
      },
      set: (value: unknown) => {
        ops.push(`set ${path}`);
        return ref.set(value);
      },
      transaction: (update: (current: unknown) => unknown) => {
        ops.push(`transaction ${path}`);
        return ref.transaction(update);
      },
    } as unknown as ReturnType<typeof real>;
  });
  return ops;
}

describe('POST /api/game/action: rejections before any game rule', () => {
  it('401 for an invalid token', async () => {
    const res = await call('action', { token: 'bad', runId: UUID_NOT_IN_DB, guess: 'REACT' });
    expect(res.status).toBe(401);
    expect(res.data).toEqual({ error: 'Invalid or expired session' });
  });

  it('400 for malformed JSON', async () => {
    const res = await json('action', '{oops', true);
    expect(res.status).toBe(400);
  });

  it.each([
    ['missing', undefined],
    ['not a UUID', 'abc'],
    ['path-like', '../runs/x'],
    ['uppercase UUID', 'ABCDEF01-0000-4000-8000-00000000000A'],
  ])('400 for a run id that is %s', async (_label, runId) => {
    const { token } = login();
    const res = await call('action', { token, runId, guess: 'REACT' });
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ error: 'Invalid run id' });
  });

  it('404 for a run that does not exist', async () => {
    const { token } = login();
    const res = await act(token, UUID_NOT_IN_DB, { guess: 'REACT' });
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Run not found' });
  });

  it('404 for another session\'s run, without revealing that it exists', async () => {
    const owner = login('Ahmad');
    const other = login('Bilal');
    const { runId } = await start('riddles', owner.token);
    tick();
    const res = await act(other.token, runId, NONE5);
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Run not found' });
    expect(run(runId).status).toBe('active');
  });

  it('400 when the body does not fit the game (flip sent to riddles)', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick();
    const res = await act(token, runId, { flip: 3 });
    expect(res.status).toBe(400);
    expect(run(runId).lastActionAt).toBe(run(runId).startedAt);
  });

  it('400 for each game when its own field is missing or the wrong type', async () => {
    const cases: Array<[Tab, Json]> = [
      ['memory', { flip: 16 }],
      ['bugs', { answers: '2' }],
      ['riddles', { answers: [null] }],
      ['riddles', { answer: 'Docker', q: 0 }],
    ];
    for (const [game, body] of cases) {
      resetDb();
      installClock();
      const { token } = login();
      const { runId } = await start(game, token);
      tick();
      const res = await act(token, runId, body);
      expect(res.status).toBe(400);
      expect(run(runId).lastActionAt).toBe(run(runId).startedAt);
    }
  });

  it('409 once a run is finished', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    expect((await act(token, runId, NONE5)).status).toBe(200);
    tick();
    const res = await act(token, runId, { flip: 0 });
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'This game is already finished' });
  });

  it('409 for a run that was replaced by a newer start of the same game', async () => {
    const { token } = login();
    const first = await start('riddles', token);
    await start('riddles', token);
    tick();
    const res = await act(token, first.runId, NONE5);
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'This game was replaced by a newer one' });
  });

  it('409 for a run past its two hour life', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    writePath(`runs/${runId}/expiresAt`, clock.now - 1);
    tick();
    const res = await act(token, runId, { answers: wrongBugs(runId) });
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'This game has expired' });
  });

  it('401 once the session itself has expired', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    clock.now += 91 * 60 * 1000;
    expect((await act(token, runId, NONE5)).status).toBe(401);
  });
});

describe('POST /api/game/action: throttling', () => {
  it('429 "Too fast" for an action 299ms after the start, allowed 1ms later', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(299);
    const res = await act(token, runId, NONE5);
    expect(res.status).toBe(429);
    expect(res.data).toEqual({ error: 'Too fast' });
    tick(1);
    expect((await act(token, runId, NONE5)).status).toBe(200);
  });

  it('uses a 120ms gap for memory flips', async () => {
    const { token } = login();
    const { runId } = await start('memory', token);
    tick(120);
    expect((await act(token, runId, { flip: 0 })).status).toBe(200);
    tick(119);
    expect((await act(token, runId, { flip: 1 })).status).toBe(429);
    tick(1);
    expect((await act(token, runId, { flip: 1 })).status).toBe(200);
  });

  it('a throttled action leaves the run unchanged', async () => {
    const { token } = login();
    const { runId } = await start('memory', token);
    tick(120);
    await act(token, runId, { flip: 0 });
    const before = run(runId);
    tick(50);
    expect((await act(token, runId, { flip: 1 })).status).toBe(429);
    expect(run(runId).state).toEqual(before.state);
  });

  it('a batch sent before half a second per answered question has passed is refused, and can follow', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(2400);
    const answers = rightRiddles(runId, 5);
    const early = await act(token, runId, { answers });
    expect(early.status).toBe(429);
    expect(early.data).toEqual({ error: 'Too fast' });
    expect(run(runId).status).toBe('active');
    tick(100);
    expect((await act(token, runId, { answers })).status).toBe(200);
  });
});

describe('riddles: one batch per run', () => {
  it('grades the whole batch in one request, returns a review for every question and finishes the run', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    const startedAt = run(runId).startedAt;
    const indices: number[] = run(runId).state.indices;
    tick(3000);
    const answers = [RIDDLE_POOL[indices[0]].answer, RIDDLE_POOL[indices[1]].answer, RIDDLE_POOL[indices[2]].answer, null, null];

    const res = await act(token, runId, { answers });
    expect(res.status).toBe(200);
    expect(res.data.done).toBe(true);
    expect(res.data.results).toEqual(
      indices.map((poolIndex, i) => ({
        answered: i < 3,
        correct: i < 3,
        correctAnswer: RIDDLE_POOL[poolIndex].answer,
      })),
    );
    expect(res.data.result).toMatchObject({
      game: 'riddles',
      score: calcRunScore('riddles', 0.6, clock.now - startedAt),
      best: calcRunScore('riddles', 0.6, clock.now - startedAt),
      improved: true,
      gamesPlayed: ['riddles'],
    });
    expect(run(runId)).toMatchObject({ status: 'done' });
  });

  it('an open riddle counts as wrong and its review still gives the answer', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    const res = await act(token, runId, NONE5);
    expect(res.status).toBe(200);
    expect(res.data.results.every((r: Json) => r.answered === false && r.correct === false)).toBe(true);
    expect(res.data.results.map((r: Json) => r.correctAnswer)).toEqual(
      (run(runId).state.indices as number[]).map((i) => RIDDLE_POOL[i].answer),
    );
    expect(res.data.result.score).toBe(0);
  });

  it('a batch that is not five entries is 400 and leaves the run open', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    expect((await act(token, runId, { answers: [null, null, null, null] })).status).toBe(400);
    expect((await act(token, runId, { answers: [null, null, null, null, null, null] })).status).toBe(400);
    expect(run(runId).status).toBe('active');
  });

  it('an option that was not shown for its riddle is 400', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    const res = await act(token, runId, { answers: ['Not An Option', null, null, null, null] });
    expect(res.status).toBe(400);
    expect(run(runId).status).toBe('active');
  });

  it('a second batch returns the first reply unchanged, even with different answers', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    const first = await act(token, runId, { answers: rightRiddles(runId) });
    const scoreBefore = (readPath('leaderboard/ahmad') as Json).score;

    tick();
    const same = await act(token, runId, { answers: rightRiddles(runId) });
    expect(same.status).toBe(200);
    expect(same.data).toEqual(first.data);

    tick();
    const different = await act(token, runId, NONE5);
    expect(different.status).toBe(200);
    expect(different.data).toEqual(first.data);
    expect((readPath('leaderboard/ahmad') as Json).score).toBe(scoreBefore);
  });

  it('other actions on a finished riddles run are 409', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    await act(token, runId, NONE5);
    tick();
    const res = await act(token, runId, { guess: 'REACT' });
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'This game is already finished' });
  });
});

describe('bug hunter: one batch per run', () => {
  it('reports the buggy line and explanation for each snippet in one batch and finishes', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    const indices: number[] = run(runId).state.indices;
    tick(3000);
    const res = await act(token, runId, { answers: indices.map((i) => BUG_POOL[i].answer) });
    expect(res.status).toBe(200);
    expect(res.data.done).toBe(true);
    res.data.results.forEach((r: Json, i: number) => {
      expect(r).toEqual({
        answered: true,
        correct: true,
        correctAnswer: BUG_POOL[indices[i]].answer,
        explanation: BUG_POOL[indices[i]].explanation,
      });
    });
    expect(res.data.result.score).toBeGreaterThanOrEqual(1000);
  });

  it('rejects a line index outside the snippet', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    tick(3000);
    expect((await act(token, runId, { answers: [99, null, null, null, null] })).status).toBe(400);
    expect((await act(token, runId, { answers: [-1, null, null, null, null] })).status).toBe(400);
    expect(run(runId).status).toBe('active');
  });
});

describe('memory', () => {
  function cardsOf(runId: string): string[] {
    return run(runId).state.layout as string[];
  }

  it('plays a perfect game in eight attempts and finishes with the move-based performance', async () => {
    const { token } = login();
    const { runId } = await start('memory', token);
    const startedAt = run(runId).startedAt;
    const layout = cardsOf(runId);

    const pairs = new Map<string, number[]>();
    layout.forEach((face, i) => pairs.set(face, [...(pairs.get(face) ?? []), i]));

    let last: Json = {};
    let moves = 0;
    for (const [, [a, b]] of pairs) {
      tick(150);
      const first = await act(token, runId, { flip: a });
      expect(first.data).toMatchObject({ pair: 'none', emoji: layout[a], moves });
      tick(150);
      last = (await act(token, runId, { flip: b })).data;
      moves++;
      expect(last).toMatchObject({ pair: 'match', other: a, moves });
    }
    expect(last.done).toBe(true);
    expect(last.result.score).toBe(calcRunScore('memory', memoryPerformance(8), clock.now - startedAt));
    expect(last.result.score).toBe(calcRunScore('memory', 1, clock.now - startedAt));
  });

  it('a mismatch counts a move and the next flip starts a fresh attempt', async () => {
    const { token } = login();
    const { runId } = await start('memory', token);
    const layout = cardsOf(runId);
    const other = layout.findIndex((face) => face !== layout[0]);

    tick(150);
    await act(token, runId, { flip: 0 });
    tick(150);
    const mismatch = await act(token, runId, { flip: other });
    expect(mismatch.data).toMatchObject({ pair: 'mismatch', other: 0, moves: 1, done: false });
    expect(run(runId).state.open).toBe(-1);

    tick(150);
    const next = await act(token, runId, { flip: 0 });
    expect(next.data).toMatchObject({ pair: 'none', moves: 1 });
  });

  it('refuses to flip a matched card or the open card', async () => {
    const { token } = login();
    const { runId } = await start('memory', token);
    const layout = cardsOf(runId);
    const twin = layout.indexOf(layout[0], 1);

    tick(150);
    await act(token, runId, { flip: 0 });
    tick(150);
    expect((await act(token, runId, { flip: 0 })).status).toBe(400);
    tick(150);
    await act(token, runId, { flip: twin });
    tick(150);
    expect((await act(token, runId, { flip: 0 })).status).toBe(400);
  });
});

describe('round trips per request', () => {
  it('a memory flip is one transaction on its run record and nothing else', async () => {
    const { token } = login();
    const { runId } = await start('memory', token);
    tick(150);
    const ops = trackOps();
    expect((await act(token, runId, { flip: 0 })).status).toBe(200);
    expect(ops).toEqual([`transaction runs/${runId}`]);
  });

  it('a batch reads the board once, settles once and writes the run record once more', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    const ops = trackOps();
    expect((await act(token, runId, { answers: rightRiddles(runId) })).status).toBe(200);
    expect([...ops].sort()).toEqual(
      [
        `transaction runs/${runId}`,
        'transaction leaderboard/ahmad',
        'get leaderboard',
        `transaction runs/${runId}/final`,
      ].sort(),
    );
  });

  it('a repeated batch touches only its run record', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    await act(token, runId, { answers: rightRiddles(runId) });
    tick();
    const ops = trackOps();
    expect((await act(token, runId, NONE5)).status).toBe(200);
    expect(ops).toEqual([`transaction runs/${runId}`]);
  });
});

describe('double requests and retries', () => {
  it('two identical flips at the same moment: only one is applied', async () => {
    const { token } = login();
    const { runId } = await start('memory', token);
    tick(150);
    const [a, b] = await Promise.all([act(token, runId, { flip: 0 }), act(token, runId, { flip: 0 })]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 429].sort());
    expect(run(runId).state.open).toBe(0);
  });

  it('two identical batches at the same moment: one is graded and both get the same reply', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    const answers = rightRiddles(runId);
    const [a, b] = await Promise.all([act(token, runId, { answers }), act(token, runId, { answers })]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.data).toEqual(a.data);
    expect((readPath('leaderboard/ahmad') as Json).games.riddles).toBe(a.data.result.score);
  });

  it('a batch whose leaderboard write failed is settled by the retry, and the retry gets the same reply', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    const indices: number[] = run(runId).state.indices;
    const results = indices.map((i) => ({ answered: true, correct: true, correctAnswer: RIDDLE_POOL[i].answer }));
    // A batch that was graded but never reached the leaderboard
    writePath(`runs/${runId}`, {
      ...run(runId),
      status: 'done',
      final: { score: 800, durationMs: 3000, response: { results }, settled: false },
    });
    expect(readPath('leaderboard/ahmad')).toBeNull();

    const first = await act(token, runId, { answers: rightRiddles(runId) });
    expect(first.status).toBe(200);
    expect(first.data).toMatchObject({ done: true, results, result: { score: 800, total: 800 } });
    expect(readPath('leaderboard/ahmad')).toMatchObject({ score: 800, games: { riddles: 800 } });

    tick();
    const retry = await act(token, runId, NONE5);
    expect(retry.status).toBe(200);
    expect(retry.data).toEqual(first.data);
    expect((readPath('leaderboard/ahmad') as Json).score).toBe(800);
  });
});

describe('leaderboard effects', () => {
  it('writes the entry with scores, total, timestamp and expiry from the session', async () => {
    const session = login();
    const { runId } = await start('riddles', session.token);
    tick(3000);
    const res = await act(session.token, runId, { answers: rightRiddles(runId) });
    const entry = readPath('leaderboard/ahmad') as Json;
    expect(entry).toMatchObject({
      name: 'Ahmad',
      score: res.data.result.score,
      games: { riddles: res.data.result.score },
      timestamp: clock.now,
      expiresAt: session.issuedAt + DAY_MS,
    });
    expect(res.data.result).toMatchObject({ rank: 1, total: res.data.result.score, improved: true });
  });

  it('adds each finished game to the total', async () => {
    const { token } = login();
    const first = await start('riddles', token);
    tick(3000);
    const riddles = await act(token, first.runId, { answers: rightRiddles(first.runId) });

    const second = await start('bugs', token);
    tick(3000);
    const indices: number[] = run(second.runId).state.indices;
    const bugs = await act(token, second.runId, { answers: indices.map((i) => BUG_POOL[i].answer) });

    expect(bugs.data.result.total).toBe(riddles.data.result.score + bugs.data.result.score);
    expect((readPath('leaderboard/ahmad') as Json).games).toMatchObject({
      riddles: riddles.data.result.score,
      bugs: bugs.data.result.score,
    });
  });

  it('a game played with no points is recorded as played (0) without moving the total', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    await act(token, runId, NONE5);
    const entry = readPath('leaderboard/ahmad') as Json;
    expect(entry.games).toEqual({ riddles: 0 });
    expect(entry.score).toBe(0);
  });

  it('ranks above lower totals and ignores expired entries', async () => {
    const { token } = login();
    writePath('leaderboard/bob', { name: 'Bob', score: 5000, games: { memory: 2500, bugs: 2500 }, timestamp: 1, expiresAt: clock.now + DAY_MS });
    writePath('leaderboard/carol', { name: 'Carol', score: 99999, games: { riddles: 99999 }, timestamp: 1, expiresAt: clock.now - 1 });
    writePath('leaderboard/dave', { name: 'Dave', score: 0, games: { bugs: 0 }, timestamp: 1, expiresAt: clock.now + DAY_MS });

    const { runId } = await start('riddles', token);
    tick(3000);
    const res = await act(token, runId, { answers: rightRiddles(runId) });
    expect(res.data.result.total).toBe(res.data.result.score);
    expect(res.data.result.rank).toBe(2);
  });

  it('an equal total reached earlier ranks above, an equal total reached later does not', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(3000);
    const res = await act(token, runId, { answers: rightRiddles(runId) });
    const score = res.data.result.score as number;
    const reachedAt = clock.now;

    writePath('leaderboard/bob', { name: 'Bob', score, games: { memory: score }, timestamp: reachedAt - 1000, expiresAt: clock.now + DAY_MS });
    writePath('leaderboard/carol', { name: 'Carol', score, games: { memory: score }, timestamp: reachedAt + 1000, expiresAt: clock.now + DAY_MS });

    // A zero-point game leaves the total and its timestamp alone, so the tie-break decides the rank
    const { runId: second } = await start('bugs', token);
    tick(3000);
    const last = await act(token, second, { answers: wrongBugs(second) });
    expect(last.data.result.total).toBe(score);
    expect(last.data.result.rank).toBe(2);
    expect((readPath('leaderboard/ahmad') as Json).timestamp).toBe(reachedAt);
  });
});

describe('transactions that start from a cache miss', () => {
  it('finishes a riddles batch and a bugs batch exactly as with a warm read', async () => {
    simulateCacheMisses(true);
    const { token } = login();
    const riddles = await start('riddles', token);
    tick(3000);
    const last = await act(token, riddles.runId, { answers: [...rightRiddles(riddles.runId, 2), null, null, null] });
    expect(last.data.done).toBe(true);
    expect(last.data.result.score).toBe(calcRunScore('riddles', 0.4, clock.now - run(riddles.runId).startedAt));

    tick();
    const bugs = await start('bugs', token);
    tick(3000);
    const indices: number[] = run(bugs.runId).state.indices;
    const res = await act(token, bugs.runId, { answers: indices.map((i) => BUG_POOL[i].answer) });
    expect(res.data.result.total).toBe(last.data.result.score + res.data.result.score);
    expect(readPath('leaderboard/ahmad')).toMatchObject({ games: { riddles: last.data.result.score, bugs: res.data.result.score } });
  });
});
