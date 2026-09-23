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

// RIDDLE_POOL[0..3] and TRIVIA_POOL[0..2] are used in validBody below
const testQuestions: QuestionsPackage = {
  riddleIndices: [0, 1, 2, 3],
  triviaIndices: [0, 1, 2],
  binaryChar: 'A',
};

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(tokenOverride?: string) {
  const { token } = signSession('Ahmad', testQuestions);
  return {
    token: tokenOverride ?? token,
    submissionId: '123e4567-e89b-12d3-a456-426614174000',
    answers: {
      riddles: ['Web Crawler', 'Docker', 'SSL/TLS', 'Python'],
      trivia: [
        { answer: 'Google Developer Student Clubs', remaining: 10 },
        { answer: 'Flutter', remaining: 10 },
        { answer: 'Gemini', remaining: 10 },
      ],
      binary: 'A',
      password: 'XkP9#mRv2!LqT7@wNb',
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
    expect(data.total).toBeGreaterThan(300);
  });

  it('returns 401 for invalid token', async () => {
    const res = await POST(makeRequest({ ...validBody(), token: 'bad.token' }));
    expect(res.status).toBe(401);
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
    body.answers.riddles = ['Wrong', 'Wrong', 'Wrong', 'Wrong'];
    body.answers.binary = 'Z'; // binaryChar is 'A', so this is wrong
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBeLessThan(200); // riddles+binary=0, only trivia+password
  });
});
