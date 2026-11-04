/**
 * @jest-environment node
 */
import { POST } from '@/app/api/admin/login/route';
import { verifyAdminToken } from '@/lib/admin/auth';
import { LOCKOUT_MS } from '@/lib/admin/lockout';
import { clock, installClock, readPath, resetDb } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

const PASSWORD = 'correct horse battery';
const WRONG = 'wrong horse battery';
const START = 1_700_000_000_000;

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.ADMIN_PASSWORD = PASSWORD;

beforeEach(() => {
  resetDb();
  clock.now = START;
  installClock();
  process.env.ADMIN_PASSWORD = PASSWORD;
  // failureDelay() waits 400 ms after each failed login. Run the timer at once so the tests stay quick.
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  }) as unknown as typeof setTimeout);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function loginRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost', ...headers },
    body,
  });
}

function login(password: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(loginRequest(JSON.stringify({ password }), headers));
}

function failureCount(): number | undefined {
  return (readPath('admin-auth/failures') as { count: number } | null)?.count;
}

function tokenFrom(res: Response): string {
  const match = /admin_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
  if (!match) throw new Error('no admin cookie was set');
  return match[1];
}

describe('POST /api/admin/login: success', () => {
  it('answers 200 and sets a signed admin cookie', async () => {
    const res = await login(PASSWORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('admin_session=');
    for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/']) expect(cookie).toContain(part);
    expect(verifyAdminToken(tokenFrom(res), clock.now)).toBe(true);
  });

  it('records a login in the admin log and clears the failure counter', async () => {
    await login(WRONG);
    expect(failureCount()).toBe(1);

    await login(PASSWORD);
    expect(readPath('admin-auth/failures')).toBeNull();

    const entries = Object.values(readPath('admin-log') as Record<string, unknown>);
    expect(entries).toContainEqual({ at: clock.now, action: 'login', target: 'admin' });
  });

  it('never puts the password in the body, the headers or the admin log', async () => {
    const res = await login(PASSWORD);
    const body = await res.text();
    const headers = JSON.stringify([...res.headers.entries()]);
    const log = JSON.stringify(readPath('admin-log'));

    expect(body).not.toContain(PASSWORD);
    expect(headers).not.toContain(PASSWORD);
    expect(log).not.toContain(PASSWORD);
  });
});

describe('POST /api/admin/login: wrong password', () => {
  it('answers 401 with a generic error', async () => {
    const res = await login(WRONG);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Incorrect password.' });
  });

  it('counts the failure', async () => {
    await login(WRONG);
    expect(failureCount()).toBe(1);
  });

  it('sets no cookie on a failure', async () => {
    const res = await login(WRONG);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('gives the same answer for every wrong password, before the lockout too', async () => {
    const guesses = ['one', 'two-two', 'three three', 'PASSWORD'];
    for (const guess of guesses) {
      const res = await login(guess);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Incorrect password.' });
    }
  });
});

describe('POST /api/admin/login: not configured', () => {
  it('answers 503 when ADMIN_PASSWORD is unset, and counts nothing', async () => {
    delete process.env.ADMIN_PASSWORD;
    const res = await login(PASSWORD);
    expect(res.status).toBe(503);
    expect(readPath('admin-auth/failures')).toBeNull();
  });

  it('answers 503 when ADMIN_PASSWORD is 11 characters, and counts nothing', async () => {
    const short = 'short-pass1';
    process.env.ADMIN_PASSWORD = short;
    const res = await login(short);
    expect(res.status).toBe(503);
    expect(readPath('admin-auth/failures')).toBeNull();
  });
});

describe('POST /api/admin/login: bad request', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 42],
  ])('answers 400 for a %s password and counts nothing', async (_label, password) => {
    const res = await login(password);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Enter the password.' });
    expect(readPath('admin-auth/failures')).toBeNull();
  });

  it('answers 400 for a body that is not JSON', async () => {
    const res = await POST(loginRequest('not json'));
    expect(res.status).toBe(400);
    expect(readPath('admin-auth/failures')).toBeNull();
  });
});

describe('POST /api/admin/login: cross-origin', () => {
  it('refuses a POST from another origin with 403, even with the right password', async () => {
    const res = await login(PASSWORD, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(readPath('admin-auth/failures')).toBeNull();
  });
});

describe('POST /api/admin/login: lockout', () => {
  it('answers 429 with Retry-After after five failures, even for the right password', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login(WRONG)).status).toBe(401);
    }

    const res = await login(PASSWORD);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBe(LOCKOUT_MS / 1000);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('accepts the right password again once LOCKOUT_MS has passed', async () => {
    for (let i = 0; i < 5; i++) await login(WRONG);

    clock.now += LOCKOUT_MS;
    const res = await login(PASSWORD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
