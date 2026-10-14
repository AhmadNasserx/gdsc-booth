/**
 * @jest-environment node
 */
import { POST } from '@/app/api/score/route';
import { signSession } from '@/lib/session';
import { BUG_POOL, RIDDLE_POOL, TRIVIA_POOL } from '@/lib/questions';
import { calcPasswordScore, calcWordleScore, normalizeScore } from '@/lib/scoring';
import type { QuestionsPackage, Tab } from '@/lib/types';

process.env.SESSION_SECRET = 'a'.repeat(64);

// Firebase mocks: controllable per test, reset in beforeEach
const mockGet = jest.fn();
const mockPush = jest.fn();
const mockSet = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    ref: jest.fn(() => ({
      get: mockGet,
      push: mockPush,
      set: mockSet,
      transaction: mockTransaction,
    })),
  },
}));

const SUBMISSION_ID = '123e4567-e89b-12d3-a456-426614174000';

const testQuestions: QuestionsPackage = {
  riddleIndices: [0, 1, 2, 3, 4],
  triviaIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  bugIndices: [0, 1, 2, 3, 4],
  wordleWord: 'REACT',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockReset().mockResolvedValue({ val: () => null });
  mockPush.mockReset().mockResolvedValue({ key: 'abc123' });
  mockSet.mockReset().mockResolvedValue(undefined);
  mockTransaction.mockReset().mockImplementation((cb: (v: unknown) => unknown) => {
    const result = cb(null); // simulate unclaimed slot
    return Promise.resolve({ committed: result !== undefined });
  });
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
    submissionId: SUBMISSION_ID,
    game,
    answer,
    ...overrides,
  };
}

const correctRiddles = RIDDLE_POOL.slice(0, 5).map((r) => r.answer);
const correctBugs = BUG_POOL.slice(0, 5).map((b) => b.answer);
const correctTrivia = TRIVIA_POOL.slice(0, 15).map((q) => ({ answer: q.answer }));

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
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('accepts a submission once 20 seconds of play have passed', async () => {
    const res = await POST(makeRequest(body('riddles', correctRiddles, { token: tokenIssuedAgo(25_000) })));
    expect(res.status).toBe(200);
  });

  it('returns 409 when this session already has a score', async () => {
    mockTransaction.mockImplementationOnce(() => Promise.resolve({ committed: false }));
    const res = await POST(makeRequest(body('riddles', correctRiddles)));
    expect(res.status).toBe(409);
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
    expect(await res.json()).toEqual({ rank: 1, total: 1000, game: 'riddles' });
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
    expect(await res.json()).toEqual({ rank: 1, total: 1000, game: 'wordle' });
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
    expect(await res.json()).toEqual({ rank: 1, total: 850, game: 'memory' });
  });

  it('bugs: all correct scores 1000', async () => {
    const res = await POST(makeRequest(body('bugs', correctBugs)));
    expect(await res.json()).toEqual({ rank: 1, total: 1000, game: 'bugs' });
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
      mockPush.mockClear();
      const res = await POST(makeRequest(body(game, answer)));
      const data = await res.json();
      expect(data.total).toBeGreaterThanOrEqual(0);
      expect(data.total).toBeLessThanOrEqual(1000);
    }
  });
});

describe('POST /api/score: persistence and rank', () => {
  it('pushes a leaderboard entry tagged with the game and normalized score', async () => {
    await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ahmad', score: 850, game: 'memory' }),
    );
  });

  it('records the submission with rank, total and game', async () => {
    await POST(makeRequest(body('bugs', correctBugs)));
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ rank: 1, total: 1000, game: 'bugs' }),
    );
  });

  it('computes rank from existing leaderboard entries', async () => {
    mockGet
      .mockResolvedValueOnce({ val: () => null }) // submissions/<id>
      .mockResolvedValueOnce({ val: () => ({ a: { score: 900 }, b: { score: 500 } }) }); // leaderboard
    const res = await POST(makeRequest(body('memory', { moves: 10, seconds: 40 })));
    expect(await res.json()).toEqual({ rank: 2, total: 850, game: 'memory' });
  });

  it('returns the stored result for a repeated submissionId without re-scoring', async () => {
    mockGet.mockResolvedValueOnce({ val: () => ({ rank: 2, total: 700, game: 'bugs', expiresAt: 1 }) });
    const res = await POST(makeRequest(body('bugs', correctBugs)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rank: 2, total: 700, game: 'bugs' });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
