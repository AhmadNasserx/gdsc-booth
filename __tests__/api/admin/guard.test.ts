/**
 * @jest-environment node
 */
import { DELETE as playersDELETE, GET as playersGET, PATCH as playersPATCH } from '@/app/api/admin/players/route';
import { GET as meGET } from '@/app/api/admin/me/route';
import { GET as overviewGET } from '@/app/api/admin/overview/route';
import { GET as winnersGET } from '@/app/api/admin/winners/route';
import { GET as exportGET } from '@/app/api/admin/export/route';
import { POST as clockPOST } from '@/app/api/admin/clock/route';
import { POST as pausePOST } from '@/app/api/admin/pause/route';
import { POST as prizesPOST } from '@/app/api/admin/prizes/route';
import { POST as logoutPOST } from '@/app/api/admin/logout/route';
import { signAdminToken } from '@/lib/admin/auth';
import { isPaused } from '@/lib/config';
import { signSession } from '@/lib/session';
import { clock, installClock, readPath, resetDb } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.ADMIN_PASSWORD = 'correct horse battery';

const ORIGIN = 'http://localhost';
const ADMIN_URL = 'http://localhost/api/admin';

type Handler = (request: Request) => Promise<Response>;

interface Route {
  name: string;
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  handler: Handler;
  body?: unknown;
}

const ROUTES: Route[] = [
  { name: 'GET me', path: '/me', method: 'GET', handler: meGET },
  { name: 'GET overview', path: '/overview', method: 'GET', handler: overviewGET },
  { name: 'GET winners', path: '/winners', method: 'GET', handler: winnersGET },
  { name: 'GET players', path: '/players', method: 'GET', handler: playersGET },
  { name: 'GET export', path: '/export', method: 'GET', handler: exportGET },
  { name: 'POST clock', path: '/clock', method: 'POST', handler: clockPOST, body: { action: 'start' } },
  { name: 'POST pause', path: '/pause', method: 'POST', handler: pausePOST, body: { paused: true } },
  {
    name: 'POST prizes',
    path: '/prizes',
    method: 'POST',
    handler: prizesPOST,
    body: { round: 1, key: 'ahmad', given: true },
  },
  {
    name: 'PATCH players',
    path: '/players',
    method: 'PATCH',
    handler: playersPATCH,
    body: { key: 'ahmad', games: { riddles: 1 } },
  },
  { name: 'DELETE players', path: '/players', method: 'DELETE', handler: playersDELETE, body: { key: 'ahmad' } },
  { name: 'POST logout', path: '/logout', method: 'POST', handler: logoutPOST },
];

/** Builds the request for a route. Headers are passed as given, so a test controls the cookie and origin. */
function build(route: Route, headers: Record<string, string>): Request {
  const init: RequestInit = { method: route.method, headers: { ...headers } };
  if (route.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json', ...headers };
    init.body = JSON.stringify(route.body);
  }
  return new Request(`${ADMIN_URL}${route.path}`, init);
}

function cookieFor(token = signAdminToken(clock.now)): string {
  return `admin_session=${token}`;
}

beforeEach(() => {
  resetDb();
  clock.now = 1_700_000_000_000;
  installClock();
  (isPaused as jest.Mock).mockResolvedValue(false);
});

describe('admin routes without a cookie', () => {
  it.each(ROUTES)('$name answers 401 and is marked no-store', async (route) => {
    const res = await route.handler(build(route, { origin: ORIGIN }));
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('admin routes with a player token in the admin cookie', () => {
  it('refuses a player session token on GET overview with 401', async () => {
    const { token } = signSession('Ahmad');
    const res = await overviewGET(build(ROUTES[1], { cookie: cookieFor(token) }));
    expect(res.status).toBe(401);
  });
});

describe('admin responses with a valid cookie', () => {
  it.each(ROUTES.filter((route) => route.method === 'GET'))('$name answers no-store', async (route) => {
    const res = await route.handler(build(route, { cookie: cookieFor() }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('logout answers 200 and clears the cookie', async () => {
    const logout = ROUTES.find((route) => route.name === 'POST logout') as Route;
    const res = await logoutPOST(build(logout, { cookie: cookieFor(), origin: ORIGIN }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});

describe('POST /api/admin/pause origin checks', () => {
  const pause = ROUTES.find((route) => route.name === 'POST pause') as Route;

  it('refuses a POST with no origin, with 403', async () => {
    const res = await pausePOST(build(pause, { cookie: cookieFor() }));
    expect(res.status).toBe(403);
    expect(readPath('config/paused')).toBeNull();
  });

  it('refuses a POST from another origin, with 403', async () => {
    const res = await pausePOST(build(pause, { cookie: cookieFor(), origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(readPath('config/paused')).toBeNull();
  });

  it('accepts a POST from this origin, with 200', async () => {
    const res = await pausePOST(build(pause, { cookie: cookieFor(), origin: ORIGIN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paused: true });
  });
});
