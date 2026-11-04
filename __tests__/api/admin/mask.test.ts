/**
 * @jest-environment node
 */
import { POST } from '@/app/api/admin/mask/route';
import { GET as adminBoard } from '@/app/api/admin/leaderboard/route';
import { GET as publicBoard } from '@/app/api/leaderboard/route';
import { signAdminToken } from '@/lib/admin/auth';
import { clearMaskCache } from '@/lib/mask';
import { clock, installClock, readPath, resetDb, writePath } from '@/test/support/rtdbMock';

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
  clearMaskCache();
  writePath('leaderboard/ann', { name: 'Ann', score: 1500, timestamp: 1, finishedAt: 1, expiresAt: clock.now + 1e6 });
  writePath('event/startedAt', clock.now - 1000);
});

function maskRequest(body: unknown, signedIn = true): Request {
  return new Request('http://localhost/api/admin/mask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: ORIGIN,
      ...(signedIn ? { cookie: `admin_session=${signAdminToken(clock.now)}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function adminGet(signedIn = true): Request {
  return new Request('http://localhost/api/admin/leaderboard', {
    headers: signedIn ? { cookie: `admin_session=${signAdminToken(clock.now)}` } : {},
  });
}

describe('leaderboard mask', () => {
  it('hides names and scores from the public leaderboard once masked, and logs it', async () => {
    const res = await POST(maskRequest({ masked: true }));
    expect(res.status).toBe(200);
    expect(readPath('config/masked')).toBe(true);
    const entries = Object.values(readPath('admin-log') as Record<string, unknown>);
    expect(entries).toContainEqual({ at: clock.now, action: 'leaderboard.mask', target: 'leaderboard' });

    const body = await (await publicBoard()).json();
    expect(body.masked).toBe(true);
    expect(body.entries).toEqual([]);
    expect(body.rounds.every((r: { top: unknown[] }) => r.top.length === 0)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('Ann');
  });

  it('still gives staff the full board while masked', async () => {
    await POST(maskRequest({ masked: true }));
    const body = await (await adminBoard(adminGet())).json();
    expect(body.masked).toBe(true);
    expect(body.entries.map((e: { name: string }) => e.name)).toEqual(['Ann']);
  });

  it('shows the board again when unmasked', async () => {
    await POST(maskRequest({ masked: true }));
    await POST(maskRequest({ masked: false }));
    const body = await (await publicBoard()).json();
    expect(body.masked).toBeUndefined();
    expect(body.entries).toHaveLength(1);
  });

  it('refuses anyone who is not signed in', async () => {
    expect((await POST(maskRequest({ masked: true }, false))).status).toBe(401);
    expect((await adminBoard(adminGet(false))).status).toBe(401);
    expect(readPath('config/masked')).toBeNull();
  });

  it('refuses a body without a boolean', async () => {
    expect((await POST(maskRequest({ masked: 'yes' }))).status).toBe(400);
  });
});
