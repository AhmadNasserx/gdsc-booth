/**
 * @jest-environment node
 */
import { POST as startPOST } from '@/app/api/game/start/route';
import { POST as actionPOST } from '@/app/api/game/action/route';
import { signSession, verifySession } from '@/lib/session';
import { BUG_POOL, RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';
import { calcRunScore, memoryPerformance, triviaPerformance } from '@/lib/scoring';
import { clock, installClock, readPath, resetDb, simulateCacheMisses, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);

const DAY_MS = 48 * 60 * 60 * 1000;
const UUID_NOT_IN_DB = '00000000-0000-4000-8000-000000000000';

beforeEach(() => {
  resetDb();
  installClock();
  simulateCacheMisses(false);
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

async function start(game: string, t = login().token): Promise<{ runId: string; view: Json }> {
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

describe('POST /api/game/action: rejections before any game rule', () => {
  it('401 for an invalid token', async () => {
    const res = await call('action', { token: 'bad', runId: UUID_NOT_IN_DB, answer: '' });
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
    const res = await call('action', { token, runId, answer: '' });
    expect(res.status).toBe(400);
    expect(res.data).toEqual({ error: 'Invalid run id' });
  });

  it('404 for a run that does not exist', async () => {
    const { token } = login();
    const res = await act(token, UUID_NOT_IN_DB, { answer: '' });
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Run not found' });
  });

  it('404 for another session\'s run, without revealing that it exists', async () => {
    const owner = login('Ahmad');
    const other = login('Bilal');
    const { runId } = await start('riddles', owner.token);
    tick();
    const res = await act(other.token, runId, { answer: '' });
    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'Run not found' });
    expect(run(runId).state.answers ?? []).toEqual([]);
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
    const cases: Array<[string, Json]> = [
      ['wordle', { guess: 12 }],
      ['memory', { flip: 16 }],
      ['password', { password: 99 }],
      ['bugs', { answer: '2' }],
      ['trivia', { answer: 4 }],
    ];
    for (const [game, body] of cases) {
      resetDb();
      installClock();
      const { token } = login();
      const { runId } = await start(game, token);
      tick();
      const res = await act(token, runId, body);
      expect(res.status).toBe(400);
    }
  });

  it('409 once a run is finished', async () => {
    const { token } = login();
    const { runId } = await start('password', token);
    tick();
    expect((await act(token, runId, { password: 'XkP9#mRv2!LqT7@wNbZcQdEf' })).status).toBe(200);
    tick();
    const res = await act(token, runId, { password: 'again' });
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'This game is already finished' });
  });

  it('409 for a run that was replaced by a newer start of the same game', async () => {
    const { token } = login();
    const first = await start('riddles', token);
    await start('riddles', token);
    tick();
    const res = await act(token, first.runId, { answer: '' });
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'This game was replaced by a newer one' });
  });

  it('409 for a run past its two hour life', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    writePath(`runs/${runId}/expiresAt`, clock.now - 1);
    tick();
    const res = await act(token, runId, { answer: 0 });
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'This game has expired' });
  });

  it('401 once the session itself has expired', async () => {
    const { token } = login();
    const { runId } = await start('password', token);
    clock.now += 91 * 60 * 1000;
    expect((await act(token, runId, { password: 'x' })).status).toBe(401);
  });
});

describe('POST /api/game/action: throttling', () => {
  it('429 "Too fast" for an action 299ms after the last one', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick(300);
    expect((await act(token, runId, { answer: '', q: 0 })).status).toBe(200);
    tick(299);
    const res = await act(token, runId, { answer: '', q: 0 });
    expect(res.status).toBe(429);
    expect(res.data).toEqual({ error: 'Too fast' });
  });

  it('allows the next action exactly 300ms later', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    tick(300);
    await act(token, runId, { answer: 0, q: 0 });
    tick(300);
    expect((await act(token, runId, { answer: 0, q: 1 })).status).toBe(200);
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
    const { runId } = await start('riddles', token);
    tick(300);
    await act(token, runId, { answer: '', q: 0 });
    const before = run(runId);
    await act(token, runId, { answer: '', q: 0 });
    expect(run(runId).state).toEqual(before.state);
  });

  it('a throttled first action right after the start is refused', async () => {
    const { token } = login();
    const { runId } = await start('wordle', token);
    tick(100);
    expect((await act(token, runId, { guess: 'REACT' })).status).toBe(429);
  });
});

describe('riddles', () => {
  it('grades five answers in order and finishes with the score for the performance', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    const startedAt = run(runId).startedAt;
    const indices: number[] = run(runId).state.indices;

    let last: Json = {};
    for (let i = 0; i < 5; i++) {
      tick();
      const answer = i < 3 ? RIDDLE_POOL[indices[i]].answer : '';
      const res = await act(token, runId, { answer, q: i });
      expect(res.status).toBe(200);
      expect(res.data.correct).toBe(i < 3);
      expect(res.data.correctAnswer).toBe(RIDDLE_POOL[indices[i]].answer);
      expect(res.data.done).toBe(i === 4);
      last = res.data;
    }
    const durationMs = clock.now - startedAt;
    expect(last.result).toMatchObject({
      game: 'riddles',
      score: calcRunScore('riddles', 0.6, durationMs),
      best: calcRunScore('riddles', 0.6, durationMs),
      improved: true,
      gamesPlayed: ['riddles'],
    });
    expect(run(runId)).toMatchObject({ status: 'done' });
  });

  it('a second answer for the same question is out of order (409) and changes nothing', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick();
    expect((await act(token, runId, { answer: '', q: 0 })).status).toBe(200);
    tick();
    expect((await act(token, runId, { answer: '', q: 0 })).status).toBe(409);
    expect(run(runId).state.answers).toHaveLength(1);
  });

  it('accepts q for the open question', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick();
    expect((await act(token, runId, { answer: '', q: 0 })).status).toBe(200);
  });

  it('rejects an answer that is not one of the options shown', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick();
    const res = await act(token, runId, { answer: 'Not An Option', q: 0 });
    expect(res.status).toBe(400);
  });
});

describe('trivia', () => {
  it('finishes after 15 answers', async () => {
    const { token } = login();
    const { runId } = await start('trivia', token);
    const indices: number[] = run(runId).state.indices;
    let last: Json = {};
    for (let i = 0; i < 15; i++) {
      tick();
      last = (await act(token, runId, { answer: TRIVIA_POOL[indices[i]].answer, q: i })).data;
    }
    expect(last.done).toBe(true);
    expect(last.result.score).toBeGreaterThan(1000);
    expect(last.result.gamesPlayed).toEqual(['trivia']);
  });

  it('{finish:true} ends the run early with the points so far', async () => {
    const { token } = login();
    const { runId } = await start('trivia', token);
    const startedAt = run(runId).startedAt;
    const indices: number[] = run(runId).state.indices;
    for (let i = 0; i < 3; i++) {
      tick();
      await act(token, runId, { answer: TRIVIA_POOL[indices[i]].answer, q: i });
    }
    tick();
    const res = await act(token, runId, { finish: true });
    expect(res.status).toBe(200);
    expect(res.data.done).toBe(true);
    expect(res.data.result.score).toBe(calcRunScore('trivia', triviaPerformance(60), clock.now - startedAt));
  });

  it('{finish:true} with no answers scores zero', async () => {
    const { token } = login();
    const { runId } = await start('trivia', token);
    tick();
    const res = await act(token, runId, { finish: true });
    expect(res.data.result).toMatchObject({ score: 0, best: 0, improved: false });
  });

  it('answering after a finish is refused', async () => {
    const { token } = login();
    const { runId } = await start('trivia', token);
    tick();
    await act(token, runId, { finish: true });
    tick();
    expect((await act(token, runId, { answer: '', q: 0 })).status).toBe(409);
  });
});

describe('bug hunter', () => {
  it('reports the buggy line and explanation for each answer and finishes after five', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    const indices: number[] = run(runId).state.indices;
    let last: Json = {};
    for (let i = 0; i < 5; i++) {
      tick();
      const bug = BUG_POOL[indices[i]];
      last = (await act(token, runId, { answer: bug.answer, q: i })).data;
      expect(last.correct).toBe(true);
      expect(last.correctAnswer).toBe(bug.answer);
      expect(last.explanation).toBe(bug.explanation);
    }
    expect(last.done).toBe(true);
    expect(last.result.score).toBeGreaterThanOrEqual(1000);
  });

  it('rejects a line index outside the snippet', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    tick();
    expect((await act(token, runId, { answer: 99 })).status).toBe(400);
    expect((await act(token, runId, { answer: -1 })).status).toBe(400);
  });
});

describe('wordle', () => {
  it('reveals nothing about the word until the run ends, and the hint from the second guess on', async () => {
    const { token } = login();
    const { runId } = await start('wordle', token);
    const word: string = run(runId).state.word;
    tick();
    const first = await act(token, runId, { guess: 'QZXJV' });
    expect(first.data.hint).toBeUndefined();
    expect(JSON.stringify(first.data)).not.toContain(word);
    tick();
    const second = await act(token, runId, { guess: 'QZXJV' });
    expect(second.data.hint).toBe(run(runId).state.hint);
    expect(JSON.stringify(second.data)).not.toContain(word);
  });

  it('solves on the third guess and scores 200 out of 300', async () => {
    const { token } = login();
    const { runId } = await start('wordle', token);
    const startedAt = run(runId).startedAt;
    const word: string = run(runId).state.word;
    tick();
    await act(token, runId, { guess: 'QZXJV' });
    tick();
    await act(token, runId, { guess: 'QZXJV' });
    tick();
    const res = await act(token, runId, { guess: word.toLowerCase() });
    expect(res.data.solved).toBe(true);
    expect(res.data.done).toBe(true);
    expect(res.data).not.toHaveProperty('word');
    expect(res.data.result.score).toBe(calcRunScore('wordle', 200 / 300, clock.now - startedAt));
  });

  it('reveals the word only after six wrong guesses', async () => {
    const { token } = login();
    const { runId } = await start('wordle', token);
    const word: string = run(runId).state.word;
    let last: Json = {};
    for (let i = 0; i < 6; i++) {
      tick();
      last = (await act(token, runId, { guess: 'QZXJV' })).data;
      if (i < 5) expect(JSON.stringify(last)).not.toContain(word);
    }
    expect(last.done).toBe(true);
    expect(last.word).toBe(word);
    expect(last.result).toMatchObject({ game: 'wordle', score: 0 });
  });

  it('rejects a guess that is not five letters', async () => {
    const { token } = login();
    const { runId } = await start('wordle', token);
    tick();
    expect((await act(token, runId, { guess: 'TOOLONG' })).status).toBe(400);
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

describe('password', () => {
  it('scores the strength and finishes with the run score', async () => {
    const { token } = login();
    const { runId } = await start('password', token);
    const startedAt = run(runId).startedAt;
    tick();
    const res = await act(token, runId, { password: 'XkP9#mRv2!LqT7@wNbZcQdEf' });
    expect(res.status).toBe(200);
    expect(res.data.done).toBe(true);
    expect(res.data.score).toBe(200);
    expect(res.data.result.score).toBe(calcRunScore('password', 1, clock.now - startedAt));
  });
});

describe('double requests and retries', () => {
  it('two identical answers at the same moment: only one is applied', async () => {
    const { token } = login();
    const { runId } = await start('riddles', token);
    tick();
    const [a, b] = await Promise.all([act(token, runId, { answer: '', q: 0 }), act(token, runId, { answer: '', q: 0 })]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 429].sort());
    expect(run(runId).state.answers).toHaveLength(1);
  });

  it('a finishing request sent twice is counted once on the leaderboard', async () => {
    const { token } = login();
    const { runId } = await start('password', token);
    tick();
    const body = { token, runId, password: 'XkP9#mRv2!LqT7@wNbZcQdEf' };
    const [a, b] = await Promise.all([call('action', body), call('action', body)]);
    // Either the duplicate is refused, or it gets the same settled result. Never a second count.
    const ok = [a, b].filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    for (const r of ok) expect(r.data.result.score).toBe(ok[0].data.result.score);
    const entry = readPath('leaderboard/ahmad') as Json;
    expect(entry.games.password).toBe(ok[0].data.result.score);
    expect(entry.score).toBe(entry.games.password);
  });

  it('a retry after the leaderboard write failed settles the run without double counting', async () => {
    const { token, issuedAt } = login();
    const { runId } = await start('password', token);
    tick();
    // Simulate a run that finished but never reached the leaderboard
    const finished = run(runId);
    writePath(`runs/${runId}`, {
      ...finished,
      status: 'done',
      final: {
        score: 800,
        durationMs: 1000,
        response: { score: 160 },
        settled: false,
      },
    });
    const res = await act(token, runId, { password: 'ignored' });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ score: 160, done: true });
    expect(res.data.result).toMatchObject({ game: 'password', score: 800, best: 800, total: 800 });
    expect(run(runId).final.settled).toBe(true);
    expect(readPath('leaderboard/ahmad')).toMatchObject({ score: 800, games: { password: 800 } });
    expect(issuedAt).toBeGreaterThan(0);

    const again = await act(token, runId, { password: 'ignored' });
    expect(again.status).toBe(409);
    expect((readPath('leaderboard/ahmad') as Json).score).toBe(800);
  });
});

describe('leaderboard effects', () => {
  it('writes the entry with bests, total, timestamp and expiry from the session', async () => {
    const session = login();
    const { runId } = await start('password', session.token);
    tick();
    const res = await act(session.token, runId, { password: 'XkP9#mRv2!LqT7@wNbZcQdEf' });
    const entry = readPath('leaderboard/ahmad') as Json;
    expect(entry).toMatchObject({
      name: 'Ahmad',
      score: res.data.result.score,
      games: { password: res.data.result.score },
      timestamp: clock.now,
      expiresAt: session.issuedAt + DAY_MS,
    });
    expect(res.data.result).toMatchObject({ rank: 1, total: res.data.result.score, improved: true });
  });

  it('keeps the best score per game and sums the bests for the total', async () => {
    const { token } = login();
    const first = await start('riddles', token);
    tick();
    for (let i = 0; i < 5; i++) {
      tick();
      await act(token, first.runId, { answer: '', q: i });
    }
    const low = (readPath('leaderboard/ahmad') as Json).games.riddles as number;

    const second = await start('riddles', token);
    const indices: number[] = run(second.runId).state.indices;
    for (let i = 0; i < 5; i++) {
      tick();
      const res = await act(token, second.runId, { answer: i < 4 ? RIDDLE_POOL[indices[i]].answer : '', q: i });
      if (i === 4) {
        expect(res.data.result).toMatchObject({ improved: true, best: res.data.result.score });
        expect(res.data.result.score).toBeGreaterThan(low);
      }
    }
    const afterHigh = readPath('leaderboard/ahmad') as Json;
    expect(afterHigh.games.riddles).toBeGreaterThan(low);
    expect(afterHigh.score).toBe(afterHigh.games.riddles);

    const third = await start('riddles', token);
    for (let i = 0; i < 5; i++) {
      tick();
      await act(token, third.runId, { answer: '', q: i });
    }
    const after = readPath('leaderboard/ahmad') as Json;
    expect(after.games.riddles).toBe(afterHigh.games.riddles);
    expect(after.score).toBe(afterHigh.score);
  });

  it('a game played with no points is recorded as played (best 0) without moving the total', async () => {
    const { token } = login();
    const { runId } = await start('bugs', token);
    for (let i = 0; i < 5; i++) {
      tick();
      await act(token, runId, { answer: (BUG_POOL[run(runId).state.indices[i]].answer + 1) % 5, q: i });
    }
    const entry = readPath('leaderboard/ahmad') as Json;
    expect(entry.games).toEqual({ bugs: 0 });
    expect(entry.score).toBe(0);
  });

  it('ranks above lower totals and ignores expired entries', async () => {
    const { token } = login();
    writePath('leaderboard/bob', { name: 'Bob', score: 5000, games: { memory: 1000, wordle: 1000, bugs: 1000, riddles: 1000, trivia: 1000 }, timestamp: 1, expiresAt: clock.now + DAY_MS });
    writePath('leaderboard/carol', { name: 'Carol', score: 99999, games: { wordle: 99999 }, timestamp: 1, expiresAt: clock.now - 1 });
    writePath('leaderboard/dave', { name: 'Dave', score: 0, games: { bugs: 0 }, timestamp: 1, expiresAt: clock.now + DAY_MS });

    const { runId } = await start('password', token);
    tick();
    const res = await act(token, runId, { password: 'XkP9#mRv2!LqT7@wNbZcQdEf' });
    expect(res.data.result.total).toBe(res.data.result.score);
    expect(res.data.result.rank).toBe(2);
  });

  it('an equal total reached earlier ranks above, an equal total reached later does not', async () => {
    const { token } = login();
    const { runId } = await start('password', token);
    tick();
    const res = await act(token, runId, { password: 'XkP9#mRv2!LqT7@wNbZcQdEf' });
    const score = res.data.result.score as number;
    const reachedAt = clock.now;

    writePath('leaderboard/bob', { name: 'Bob', score, games: { memory: score }, timestamp: reachedAt - 1000, expiresAt: clock.now + DAY_MS });
    writePath('leaderboard/carol', { name: 'Carol', score, games: { memory: score }, timestamp: reachedAt + 1000, expiresAt: clock.now + DAY_MS });

    // A zero-point run leaves the total and its timestamp alone, so the tie-break decides the rank
    const { runId: second } = await start('riddles', token);
    let last: Json = {};
    for (let i = 0; i < 5; i++) {
      tick();
      last = (await act(token, second, { answer: '', q: i })).data;
    }
    expect(last.result.total).toBe(score);
    expect(last.result.rank).toBe(2);
    expect((readPath('leaderboard/ahmad') as Json).timestamp).toBe(reachedAt);
  });
});

describe('transactions that start from a cache miss', () => {
  it('finishes a riddles run and a password run exactly as with a warm read', async () => {
    simulateCacheMisses(true);
    const { token } = login();
    const riddles = await start('riddles', token);
    const indices: number[] = run(riddles.runId).state.indices;
    let last: Json = {};
    for (let i = 0; i < 5; i++) {
      tick();
      last = (await act(token, riddles.runId, { answer: i < 2 ? RIDDLE_POOL[indices[i]].answer : '', q: i })).data;
    }
    expect(last.done).toBe(true);
    expect(last.result.score).toBe(calcRunScore('riddles', 0.4, clock.now - run(riddles.runId).startedAt));

    tick();
    const pw = await start('password', token);
    tick();
    const res = await act(token, pw.runId, { password: 'XkP9#mRv2!LqT7@wNbZcQdEf' });
    expect(res.data.result.total).toBe(last.result.score + res.data.result.score);
    expect(readPath('leaderboard/ahmad')).toMatchObject({ games: { riddles: last.result.score, password: res.data.result.score } });
  });
});

describe('question index q on sequential answers', () => {
  it.each([
    ['riddles', { answer: '' }],
    ['trivia', { answer: '' }],
    ['bugs', { answer: 0 }],
  ] as const)('%s: an answer without q is 400 and changes nothing', async (game, body) => {
    const { token } = login();
    const { runId } = await start(game, token);
    tick();
    const res = await act(token, runId, body);
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/q \(question index\) is required/);
    expect(run(runId).state.answers ?? []).toEqual([]);
    expect(run(runId).lastActionAt).toBe(run(runId).startedAt);
  });

  it.each([
    ['riddles', { answer: '', q: '0' }],
    ['trivia', { answer: '', q: 0.5 }],
    ['bugs', { answer: 0, q: -1 }],
  ] as const)('%s: a non-integer or negative q is 400', async (game, body) => {
    const { token } = login();
    const { runId } = await start(game, token);
    tick();
    expect((await act(token, runId, body)).status).toBe(400);
  });

  it.each([
    ['riddles', (i: number) => ({ answer: '', q: i })],
    ['trivia', (i: number) => ({ answer: '', q: i })],
    ['bugs', (i: number) => ({ answer: 0, q: i })],
  ] as const)('%s: q for a question other than the open one is 409 and changes nothing', async (game, body) => {
    const { token } = login();
    const { runId } = await start(game, token);
    tick();
    const res = await act(token, runId, body(3));
    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: 'Answer is out of order' });
    expect(run(runId).state.answers ?? []).toEqual([]);
  });

  it('trivia {finish:true} needs no q', async () => {
    const { token } = login();
    const { runId } = await start('trivia', token);
    tick();
    expect((await act(token, runId, { finish: true })).status).toBe(200);
  });
});
