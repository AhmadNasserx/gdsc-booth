/**
 * @jest-environment node
 */
import { randomUUID } from 'crypto';
import { POST } from '@/app/api/score/route';
import { signSession, verifySession } from '@/lib/session';
import { BUG_POOL, RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';
import { calcPasswordScore, calcWordleScore, normalizeScore } from '@/lib/scoring';
import type { QuestionsPackage, Tab } from '@/lib/types';

process.env.SESSION_SECRET = 'a'.repeat(64);

// In-memory tree standing in for the Realtime Database. transaction() follows the real
// semantics: the callback receives the current value and returning undefined aborts the write.
const mockTree: Record<string, unknown> = {};
let mockPushCount = 0;

function mockRead(path: string): unknown {
  let node: unknown = mockTree;
  for (const key of path.split('/')) {
    if (node === null || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[key];
  }
  return node === undefined ? null : node;
}

function mockWrite(path: string, value: unknown): void {
  const keys = path.split('/');
  const last = keys.pop() as string;
  let node = mockTree;
  for (const key of keys) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  if (value === null) delete node[last];
  else node[last] = value;
}

function mockRef(path: string) {
  return {
    get: async () => ({ val: () => mockRead(path) }),
    set: async (value: unknown) => {
      mockWrite(path, value);
    },
    push: async (value: unknown) => {
      const key = `-push${++mockPushCount}`;
      mockWrite(`${path}/${key}`, value);
      return { key };
    },
    transaction: async (update: (current: unknown) => unknown) => {
      const next = update(mockRead(path));
      if (next === undefined) return { committed: false };
      mockWrite(path, next);
      return { committed: true };
    },
  };
}

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    ref: (path: string) => mockRef(path),
  },
}));

const testQuestions: QuestionsPackage = {
  riddleIndices: [0, 1, 2, 3, 4],
  triviaIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  bugIndices: [0, 1, 2, 3, 4],
  wordleWord: 'REACT',
};

const FUTURE = Date.now() + 60 * 60 * 1000;

beforeEach(() => {
  for (const key of Object.keys(mockTree)) delete mockTree[key];
  mockPushCount = 0;
});

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Signs a session token whose issuedAt is `agoMs` in the past. */
function tokenIssuedAgo(agoMs: number, questions: QuestionsPackage = testQuestions): string {
  const origNow = Date.now;
  Date.now = () => origNow() - agoMs;
  try {
    return signSession('Ahmad', questions).token;
  } finally {
    Date.now = origNow;
  }
}

function body(game: Tab | string, answer: unknown, overrides: Record<string, unknown> = {}) {
  return {
    token: tokenIssuedAgo(30_000),
    submissionId: randomUUID(),
    game,
    answer,
    ...overrides,
  };
}

const correctRiddles = RIDDLE_POOL.slice(0, 5).map((r) => r.answer);
const correctBugs = BUG_POOL.slice(0, 5).map((b) => b.answer);
const correctTrivia = TRIVIA_POOL.slice(0, 15).map((q) => ({ answer: q.answer }));

/** Total for a single riddle answer, used when a lower-scoring run is needed. */
const ONE_RIDDLE_TOTAL = normalizeScore('riddles', 40);
const MEMORY_TOTAL = normalizeScore('memory', 850);

describe('POST /api/score: gates', () => {
  it('returns 401 for an invalid token', async () => {
    const res = await POST(makeRequest(body('riddles', correctRiddles, { token: 'bad.token' })));
    expect(res.status).toBe(401);
  });

  it('returns 400 with "Invalid game" for an unknown game', async () => {
    const res = await POST(makeRequest(body('binary', correctRiddles)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid game' });
  });

  it('returns 400 with "Invalid game" when game is missing', async () => {
    const rest: Record<string, unknown> = { ...body('riddles', correctRiddles) };
    delete rest.game;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid game' });
  });

  it('returns 400 for an invalid submissionId', async () => {
    const res = await POST(makeRequest(body('riddles', correctRiddles, { submissionId: 'nope' })));
    expect(res.status).toBe(400);
  });

  it('returns 429 when the session has been playing for under 20 seconds', async () => {
    const res = await POST(makeRequest(body('riddles', correctRiddles, { token: tokenIssuedAgo(10_000) })));
    expect(res.status).toBe(429);
    expect(mockRead('leaderboard')).toBeNull();
  });

  it('accepts a submission once 20 seconds of play have passed', async () => {
    const res = await POST(makeRequest(body('riddles', correctRiddles, { token: tokenIssuedAgo(25_000) })));
    expect(res.status).toBe(200);
  });

  it('returns 409 when the same session submits a second score', async () => {
    const token = tokenIssuedAgo(30_000);
    const first = await POST(makeRequest(body('riddles', correctRiddles, { token })));
    expect(first.status).toBe(200);
    const second = await POST(makeRequest(body('riddles', correctRiddles, { token })));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'Score already submitted for this session' });
  });
});

describe('POST /api/score: answer shapes', () => {
  it('returns 400 for wrong number of riddle answers', async () => {
    const res = await POST(makeRequest(body('riddles', ['Web Crawler'])));
    expect(res.status).toBe(400);
  });

  it('returns 400 when trivia has more answers than questions', async () => {
    const answer = Array.from({ length: 16 }, () => ({ answer: 'X' }));
    const res = await POST(makeRequest(body('trivia', answer)));
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is not a string', async () => {
    const res = await POST(makeRequest(body('password', 12345)));
    expect(res.status).toBe(400);
  });

  it('returns 400 for wordle guesses that are not 5 uppercase letters', async () => {
    const res = await POST(makeRequest(body('wordle', ['react'])));
    expect(res.status).toBe(400);
  });

  it('returns 400 for more than six wordle guesses', async () => {
    const res = await POST(makeRequest(body('wordle', Array.from({ length: 7 }, () => 'BYTES'))));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty wordle guess list', async () => {
    const res = await POST(makeRequest(body('wordle', [])));
    expect(res.status).toBe(400);
  });

  it('returns 400 for implausible memory results', async () => {
    const res = await POST(makeRequest(body('memory', { moves: 5, seconds: 40 })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for memory results with missing or non-integer fields', async () => {
    expect((await POST(makeRequest(body('memory', { moves: 10 })))).status).toBe(400);
    expect((await POST(makeRequest(body('memory', { moves: 10.5, seconds: 40 })))).status).toBe(400);
    expect((await POST(makeRequest(body('memory', null)))).status).toBe(400);
  });

  it('returns 400 for bug answers that are not exactly 5 integers', async () => {
    expect((await POST(makeRequest(body('bugs', [0, 1, 2, 3])))).status).toBe(400);
    expect((await POST(makeRequest(body('bugs', [0, 1, 2, 3, 1.5])))).status).toBe(400);
    expect((await POST(makeRequest(body('bugs', ['0', '1', '2', '3', '4'])))).status).toBe(400);
  });

  it('returns 400 when the answer is missing', async () => {
    const rest: Record<string, unknown> = { ...body('riddles', correctRiddles) };
    delete rest.answer;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/score: grading only the chosen game', () => {
  it('riddles: all correct scores 1000 on the leaderboard scale', async () => {
    const res = await POST(makeRequest(body('riddles', correctRiddles)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rank: 1, total: 1000, game: 'riddles', best: 1000, improved: true });
  });

  it('riddles: 40 raw points per correct answer, normalized', async () => {
    const answer = [correctRiddles[0], correctRiddles[1], 'x', 'x', 'x'];
    const res = await POST(makeRequest(body('riddles', answer)));
    expect(await res.json()).toMatchObject({ total: normalizeScore('riddles', 80) });
  });

  it('trivia: 10 right and 5 wrong gives 150 raw, normalized to 500', async () => {
    const answer = [
      ...correctTrivia.slice(0, 10),
      ...Array.from({ length: 5 }, () => ({ answer: 'Nope' })),
    ];
    const res = await POST(makeRequest(body('trivia', answer)));
    expect(await res.json()).toMatchObject({ total: 500, game: 'trivia' });
  });

  it('trivia: all correct caps at 300 raw, normalized to 1000', async () => {
    const res = await POST(makeRequest(body('trivia', correctTrivia)));
    expect(await res.json()).toMatchObject({ total: 1000 });
  });

  it('trivia: wrong answers never go below zero', async () => {
    const answer = Array.from({ length: 5 }, () => ({ answer: 'Nope' }));
    const res = await POST(makeRequest(body('trivia', answer)));
    expect(await res.json()).toMatchObject({ total: 0 });
  });

  it('password: scores the password and normalizes it', async () => {
    const pw = 'Xk7@mPv!';
    const res = await POST(makeRequest(body('password', pw)));
    expect(await res.json()).toMatchObject({
      total: normalizeScore('password', calcPasswordScore(pw)),
      game: 'password',
    });
  });

  it('wordle: solving on the first guess gives 1000', async () => {
    const res = await POST(makeRequest(body('wordle', ['REACT'])));
    expect(await res.json()).toMatchObject({ rank: 1, total: 1000, game: 'wordle' });
  });

  it('wordle: solving on the third guess uses the table value', async () => {
    const res = await POST(makeRequest(body('wordle', ['BYTES', 'CACHE', 'REACT'])));
    expect(await res.json()).toMatchObject({
      total: normalizeScore('wordle', calcWordleScore(3, true)),
    });
  });

  it('wordle: six wrong guesses score 0 but are accepted', async () => {
    const res = await POST(makeRequest(body('wordle', ['BYTES', 'CACHE', 'STACK', 'LAYER', 'CLONE', 'REDUX'])));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0 });
  });

  it('memory: 10 moves and 40 seconds gives 850 raw, which is 850 total', async () => {
    const res = await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rank: 1, total: 850, game: 'memory', best: 850, improved: true });
  });

  it('bugs: all correct scores 1000', async () => {
    const res = await POST(makeRequest(body('bugs', correctBugs)));
    expect(await res.json()).toMatchObject({ rank: 1, total: 1000, game: 'bugs' });
  });

  it('bugs: 40 raw points per correct line, normalized', async () => {
    const answer = [correctBugs[0], correctBugs[1], 99, 99, 99];
    const res = await POST(makeRequest(body('bugs', answer)));
    expect(await res.json()).toMatchObject({ total: normalizeScore('bugs', 80) });
  });

  it('wrong answers score 0 points rather than being rejected', async () => {
    const res = await POST(makeRequest(body('riddles', ['Wrong', 'Wrong', 'Wrong', 'Wrong', 'Wrong'])));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 0 });
  });

  it('every total stays within 0..1000', async () => {
    const cases: [Tab, unknown][] = [
      ['riddles', correctRiddles],
      ['trivia', correctTrivia],
      ['password', 'XkP9#mRv2!LqT7@wNbZcQdEfHpJsAi'],
      ['wordle', ['REACT']],
      ['memory', { moves: 8, seconds: 6 }],
      ['bugs', correctBugs],
    ];
    for (const [game, answer] of cases) {
      const res = await POST(makeRequest(body(game, answer)));
      const data = await res.json();
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeLessThanOrEqual(1000);
    }
  });
});

describe('POST /api/score: best per player on the leaderboard', () => {
  it('writes the first run as the player entry, keyed by normalized name', async () => {
    await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(mockRead('leaderboard/ahmad')).toEqual({
      name: 'Ahmad',
      score: 850,
      game: 'memory',
      timestamp: expect.any(Number),
      expiresAt: expect.any(Number),
    });
  });

  it('first submission reports best = total and improved = true', async () => {
    const res = await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(await res.json()).toEqual({ rank: 1, total: 850, game: 'memory', best: 850, improved: true });
  });

  it('a lower run keeps the old best, reports improved = false, and refreshes expiresAt', async () => {
    const soon = Date.now() + 1000;
    mockWrite('leaderboard/ahmad', { name: 'Ahmad', score: 850, game: 'memory', timestamp: 1, expiresAt: soon });

    const res = await POST(makeRequest(body('riddles', [RIDDLE_POOL[0].answer, 'x', 'x', 'x', 'x'])));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ rank: 1, total: ONE_RIDDLE_TOTAL, game: 'riddles', best: 850, improved: false });

    const entry = mockRead('leaderboard/ahmad') as Record<string, unknown>;
    expect(entry).toMatchObject({ score: 850, game: 'memory', timestamp: 1 });
    expect(entry.expiresAt as number).toBeGreaterThan(soon);
  });

  it('a higher run replaces the entry and reports improved = true', async () => {
    mockWrite('leaderboard/ahmad', {
      name: 'Ahmad', score: MEMORY_TOTAL, game: 'memory', timestamp: 1, expiresAt: FUTURE,
    });

    const res = await POST(makeRequest(body('riddles', correctRiddles)));
    expect(await res.json()).toEqual({ rank: 1, total: 1000, game: 'riddles', best: 1000, improved: true });
    expect(mockRead('leaderboard/ahmad')).toMatchObject({ name: 'Ahmad', score: 1000, game: 'riddles' });
  });

  it('an equal run keeps the old best (improved = false)', async () => {
    mockWrite('leaderboard/ahmad', { name: 'Ahmad', score: 1000, game: 'bugs', timestamp: 1, expiresAt: FUTURE });
    const res = await POST(makeRequest(body('riddles', correctRiddles)));
    expect(await res.json()).toMatchObject({ total: 1000, best: 1000, improved: false, game: 'riddles' });
    expect(mockRead('leaderboard/ahmad')).toMatchObject({ game: 'bugs', timestamp: 1 });
  });

  it('an expired entry does not count as a best, so a lower run replaces it', async () => {
    mockWrite('leaderboard/ahmad', { name: 'Ahmad', score: 900, game: 'bugs', timestamp: 1, expiresAt: 1 });
    const res = await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(await res.json()).toMatchObject({ best: 850, improved: true });
    expect(mockRead('leaderboard/ahmad')).toMatchObject({ score: 850, game: 'memory' });
  });

  it('leaves legacy push-id entries and other players entries untouched', async () => {
    const legacy = { name: 'Ahmad', score: 300, timestamp: 1, expiresAt: FUTURE };
    const other = { name: 'Sara', score: 100, game: 'bugs', timestamp: 1, expiresAt: FUTURE };
    mockWrite('leaderboard/-Nlegacy', legacy);
    mockWrite('leaderboard/sara', other);

    await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(mockRead('leaderboard/-Nlegacy')).toEqual(legacy);
    expect(mockRead('leaderboard/sara')).toEqual(other);
  });

  it('records the submission with rank, total, game, best and improved', async () => {
    const res = await POST(makeRequest(body('bugs', correctBugs, { submissionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })));
    expect(res.status).toBe(200);
    expect(mockRead('submissions/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toMatchObject({
      rank: 1, total: 1000, game: 'bugs', best: 1000, improved: true,
    });
  });

  it('ranks against other players using this player best, not the run score', async () => {
    mockWrite('leaderboard', {
      ahmad: { name: 'Ahmad', score: 850, game: 'memory', timestamp: 1, expiresAt: FUTURE },
      other: { name: 'Sara', score: 900, game: 'bugs', timestamp: 1, expiresAt: FUTURE },
      third: { name: 'Omar', score: 500, game: 'bugs', timestamp: 1, expiresAt: FUTURE },
    });
    // The run scores far below everyone, but the player's best (850) is only beaten by Sara
    const res = await POST(makeRequest(body('riddles', ['x', 'x', 'x', 'x', 'x'])));
    expect(await res.json()).toEqual({ rank: 2, total: 0, game: 'riddles', best: 850, improved: false });
  });

  it('ranks a new best against the entries that beat it', async () => {
    mockWrite('leaderboard', {
      other: { name: 'Sara', score: 900, game: 'bugs', timestamp: 1, expiresAt: FUTURE },
      third: { name: 'Omar', score: 500, game: 'bugs', timestamp: 1, expiresAt: FUTURE },
    });
    const res = await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(await res.json()).toEqual({ rank: 2, total: 850, game: 'memory', best: 850, improved: true });
  });

  it('a repeated submissionId returns the stored response without re-scoring or writing', async () => {
    const submissionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const first = await POST(makeRequest(body('riddles', correctRiddles, { submissionId })));
    const firstData = await first.json();
    expect(firstData).toEqual({ rank: 1, total: 1000, game: 'riddles', best: 1000, improved: true });
    const entryBefore = mockRead('leaderboard/ahmad');

    // A later session sends the same submissionId while the board has changed
    mockWrite('leaderboard/omar', { name: 'Omar', score: 5000, timestamp: 1, expiresAt: FUTURE });
    const replay = await POST(makeRequest(body('memory', { moves: 10, seconds: 40 }, { submissionId })));

    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstData);
    expect(mockRead('leaderboard/ahmad')).toEqual(entryBefore);
  });

  it('replays a record written before best-per-name with best = total and improved = false', async () => {
    const legacyId = '11111111-2222-4333-8444-555555555555';
    mockWrite(`submissions/${legacyId}`, { rank: 2, total: 700, game: 'bugs', expiresAt: FUTURE });
    const res = await POST(makeRequest(body('bugs', correctBugs, { submissionId: legacyId })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rank: 2, total: 700, game: 'bugs', best: 700, improved: false });
  });
});

describe('POST /api/score: session claim', () => {
  it('uses the token session id for the one-submission-per-session slot', async () => {
    const token = tokenIssuedAgo(30_000);
    const { sessionId } = verifySession(token) ?? { sessionId: '' };
    await POST(makeRequest(body('riddles', correctRiddles, { token })));
    expect(mockRead(`submissions/by-session/${sessionId}`)).toMatchObject({ expiresAt: expect.any(Number) });
  });
});
