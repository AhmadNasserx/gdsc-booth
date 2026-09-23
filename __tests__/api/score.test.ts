/**
 * @jest-environment node
 */
import { POST } from '@/app/api/score/route';
import { signSession } from '@/lib/session';
import type { QuestionsPackage } from '@/lib/types';

process.env.SESSION_SECRET = 'a'.repeat(64);

// Mock Firebase Admin
jest.mock('@/lib/firebaseAdmin', () => {
  const mockTransaction = jest.fn((cb: (v: unknown) => unknown) => {
    const result = cb(null); // simulate unclaimed slot
    return Promise.resolve({ committed: result !== undefined, snapshot: { val: () => result } });
  });
  const mockRef = jest.fn(() => ({
    push: jest.fn().mockResolvedValue({ key: 'abc123' }),
    get: jest.fn().mockResolvedValue({ val: () => null }),
    set: jest.fn(),
    transaction: mockTransaction,
  }));
  return { adminDb: { ref: mockRef } };
});

const testQuestions: QuestionsPackage = {
  riddleIndices: [0, 1, 2, 3, 4],
  triviaIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
  binaryChar: 'A',
  wordleWord: 'REACT',
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(tokenOverride?: string) {
  // Backdate token by 50 s so the 45 s time gate doesn't fire
  const origNow = Date.now;
  Date.now = () => origNow() - 50_000;
  const { token } = signSession('Ahmad', testQuestions);
  Date.now = origNow;
  return {
    token: tokenOverride ?? token,
    submissionId: '123e4567-e89b-12d3-a456-426614174000',
    answers: {
      riddles: ['Web Crawler', 'Docker', 'SSL/TLS', 'Python', 'Cloud Storage'],
      trivia: [
        { answer: 'Google Developer Student Clubs' },
        { answer: 'Flutter' },
        { answer: 'Gemini' },
      ],
      binary: 'A',
      password: 'XkP9#mRv2!LqT7@wNb',
      wordle: ['REACT'],
    },
  };
}

describe('POST /api/score', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with rank and total for valid submission', async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.rank).toBe('number');
    expect(typeof data.total).toBe('number');
    expect(data.total).toBeGreaterThan(400);
  });

  it('returns 401 for invalid token', async () => {
    const res = await POST(makeRequest({ ...validBody(), token: 'bad.token' }));
    expect(res.status).toBe(401);
  });

  it('returns 429 when score is submitted too quickly', async () => {
    const { token } = signSession('Ahmad', testQuestions); // issuedAt = now, no backdate
    const body = { ...validBody(), token };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(429);
  });

  it('returns 400 for wrong number of riddle answers', async () => {
    const body = validBody();
    body.answers.riddles = ['Web Crawler'];
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid binary answer', async () => {
    const body = validBody();
    (body.answers as Record<string, unknown>).binary = 'abc';
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing answers', async () => {
    const { answers: _a, ...rest } = validBody();
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(400);
  });

  it('wrong answers score 0 points, not rejected', async () => {
    const body = validBody();
    body.answers.riddles = ['Wrong', 'Wrong', 'Wrong', 'Wrong', 'Wrong'];
    body.answers.binary = 'Z'; // binaryChar is 'A', so this is wrong
    (body.answers as Record<string, unknown>).wordle = ['BYTES', 'CACHE', 'STACK', 'LAYER', 'CLONE', 'REDUX']; // all wrong
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBeLessThan(500); // riddles+binary+wordle=0, only trivia+password
  });

  it('accepts zero trivia answers (player skipped quickly)', async () => {
    const body = validBody();
    body.answers.trivia = [];
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
  });

  it('returns 400 for too many trivia answers', async () => {
    const body = validBody();
    body.answers.trivia = Array.from({ length: 16 }, () => ({ answer: 'X' }));
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });
});
