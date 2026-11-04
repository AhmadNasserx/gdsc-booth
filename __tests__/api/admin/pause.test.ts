/**
 * @jest-environment node
 */
import { POST } from '@/app/api/admin/pause/route';
import { signAdminToken } from '@/lib/admin/auth';
import { clearPauseCache } from '@/lib/config';
import { clock, installClock, readPath, resetDb } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.ADMIN_PASSWORD = 'correct horse battery';

const ORIGIN = 'http://localhost';

beforeEach(() => {
  resetDb();
  clock.now = 1_700_000_000_000;
  installClock();
  (clearPauseCache as jest.Mock).mockClear();
});

function pauseRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/pause', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: ORIGIN,
      cookie: `admin_session=${signAdminToken(clock.now)}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/pause', () => {
  it('stores the pause flag, clears the pause cache and logs the change', async () => {
    const res = await POST(pauseRequest({ paused: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paused: true });

    expect(readPath('config/paused')).toBe(true);
    expect(clearPauseCache).toHaveBeenCalled();

    const entries = Object.values(readPath('admin-log') as Record<string, unknown>);
    expect(entries).toContainEqual({ at: clock.now, action: 'game.pause', target: 'game' });
  });

  it('clears the pause flag and logs a resume', async () => {
    await POST(pauseRequest({ paused: true }));
    const res = await POST(pauseRequest({ paused: false }));
    expect(res.status).toBe(200);

    expect(readPath('config/paused')).toBe(false);
    const entries = Object.values(readPath('admin-log') as Record<string, unknown>);
    expect(entries).toContainEqual({ at: clock.now, action: 'game.resume', target: 'game' });
  });

  it.each([
    ['a string', { paused: 'yes' }],
    ['a number', { paused: 1 }],
    ['missing', {}],
  ])('answers 400 when paused is %s and writes nothing', async (_label, body) => {
    const res = await POST(pauseRequest(body));
    expect(res.status).toBe(400);
    expect(readPath('config/paused')).toBeNull();
    expect(clearPauseCache).not.toHaveBeenCalled();
  });
});
