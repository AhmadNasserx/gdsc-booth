/**
 * @jest-environment node
 */
import { POST } from '@/app/api/session/route';

process.env.SESSION_SECRET = 'a'.repeat(64);

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    ref: jest.fn(() => ({
      transaction: jest.fn((cb: (v: unknown) => unknown) => {
        const result = cb(null); // name always available in tests
        return Promise.resolve({ committed: result !== undefined });
      }),
    })),
  },
}));

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/session', () => {
  it('returns a token and questions package for a valid name', async () => {
    const res = await POST(makeRequest({ name: 'Ahmad' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.token).toBe('string');
    expect(Array.isArray(data.questions.riddles)).toBe(true);
    expect(data.questions.riddles).toHaveLength(4);
    expect(Array.isArray(data.questions.trivia)).toBe(true);
    expect(data.questions.trivia).toHaveLength(3);
    expect(data.questions.binaryChar).toMatch(/^[A-Z]$/);
  });

  it('returns 400 for empty name', async () => {
    const res = await POST(makeRequest({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for name over 30 chars', async () => {
    const res = await POST(makeRequest({ name: 'A'.repeat(31) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for name with HTML special characters', async () => {
    const res = await POST(makeRequest({ name: '<script>xss</script>' }));
    expect(res.status).toBe(400);
  });
});
