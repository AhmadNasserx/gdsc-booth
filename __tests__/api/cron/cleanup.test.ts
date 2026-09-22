/**
 * @jest-environment node
 */
import { GET } from '@/app/api/cron/cleanup/route';

process.env.CRON_SECRET = 'test-cron-secret';

const mockExpired = {
  entry1: { name: 'Old', score: 100, expiresAt: Date.now() - 1000 },
};
const mockFresh = {
  entry2: { name: 'New', score: 200, expiresAt: Date.now() + 86400000 },
};

const mockRemove = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    ref: jest.fn((path: string) => ({
      get: jest.fn().mockResolvedValue({
        val: () => (path === 'leaderboard' ? { ...mockExpired, ...mockFresh } : {}),
        forEach: (cb: (snap: { key: string; val: () => unknown }) => void) => {
          const data = path === 'leaderboard' ? { ...mockExpired, ...mockFresh } : {};
          Object.entries(data).forEach(([key, val]) => cb({ key, val: () => val }));
        },
      }),
      child: jest.fn(() => ({ remove: mockRemove })),
    })),
  },
}));

function makeRequest(auth?: string) {
  return new Request('http://localhost/api/cron/cleanup', {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
}

describe('GET /api/cron/cleanup', () => {
  it('returns 401 without authorization', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong secret', async () => {
    const res = await GET(makeRequest('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('deletes expired entries and returns count', async () => {
    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBeGreaterThanOrEqual(1);
  });
});
