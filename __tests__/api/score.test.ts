/**
 * @jest-environment node
 */
import { POST } from '@/app/api/score/route';
import { signSession } from '@/lib/session';

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// Mock Upstash
jest.mock('@/lib/rateLimit', () => ({
  ratelimit: { limit: jest.fn().mockResolvedValue({ success: true }) },
  hashKey: (s: string) => s,
}));

// Mock Firebase Admin
jest.mock('@/lib/firebaseAdmin', () => {
  const mockPush = jest.fn().mockResolvedValue({ key: 'abc123' });
  const mockRef = jest.fn(() => ({
    push: mockPush,
    get: jest.fn().mockResolvedValue({ val: () => null }),
    set: jest.fn(),
  }));
  return { adminDb: { ref: mockRef } };
});

function makeRequest(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

function validBody(tokenOverride?: string) {
  const { token } = signSession('Ahmad');
  return {
    token: tokenOverride ?? token,
    submissionId: 'sub-123',
    scores: { riddles: 75, trivia: 50, binary: 100, password: 80 },
  };
}

describe('POST /api/score', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with rank and total for valid submission', async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.rank).toBe('number');
    expect(data.total).toBe(305);
  });

  it('returns 403 for wrong origin', async () => {
    const res = await POST(makeRequest(validBody(), 'http://evil.com'));
    expect(res.status).toBe(403);
  });

  it('returns 401 for invalid token', async () => {
    const res = await POST(makeRequest({ ...validBody(), token: 'bad.token' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid score values', async () => {
    const body = { ...validBody(), scores: { riddles: 10, trivia: 50, binary: 100, password: 80 } };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    const { ratelimit } = require('@/lib/rateLimit');
    ratelimit.limit.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
  });
});
