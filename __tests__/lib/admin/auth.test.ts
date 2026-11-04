/**
 * @jest-environment node
 */
import {
  ADMIN_SESSION_MAX_AGE_S,
  adminCookie,
  adminReady,
  clearedAdminCookie,
  passwordMatches,
  requireAdmin,
  sameOrigin,
  signAdminToken,
  verifyAdminToken,
  type AdminAccess,
} from '@/lib/admin/auth';
import { signSession, verifySession } from '@/lib/session';
import { clock, installClock } from '@/test/support/rtdbMock';

const PASSWORD = 'correct horse battery';
const SECRET = 'a'.repeat(64);
const MINUTE = 60 * 1000;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

process.env.SESSION_SECRET = SECRET;
process.env.ADMIN_PASSWORD = PASSWORD;

function setEnv(name: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[name];
  else env[name] = value;
}

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/admin/pause', { method, headers });
}

function adminCookieHeader(): string {
  return `admin_session=${signAdminToken(clock.now)}`;
}

/** The refusal from requireAdmin. Fails the test if the request was admitted. */
function refusal(access: AdminAccess): Response {
  if (access.ok) throw new Error('expected the request to be refused');
  return access.response;
}

beforeEach(() => {
  setEnv('ADMIN_PASSWORD', PASSWORD);
  setEnv('SESSION_SECRET', SECRET);
  clock.now = 1_700_000_000_000;
  installClock();
});

afterEach(() => {
  jest.restoreAllMocks();
  setEnv('NODE_ENV', ORIGINAL_NODE_ENV);
});

describe('passwordMatches', () => {
  it('is true for the configured password', () => {
    expect(passwordMatches(PASSWORD)).toBe(true);
  });

  it('is false for a wrong password', () => {
    expect(passwordMatches('wrong horse battery')).toBe(false);
  });

  it('is false when ADMIN_PASSWORD is unset', () => {
    setEnv('ADMIN_PASSWORD', undefined);
    expect(passwordMatches(PASSWORD)).toBe(false);
  });

  it('is false when ADMIN_PASSWORD is shorter than 12 characters', () => {
    const short = 'short-pass1';
    expect(short).toHaveLength(11);
    setEnv('ADMIN_PASSWORD', short);
    expect(passwordMatches(short)).toBe(false);
  });

  it('refuses a guess that differs only in its last character', () => {
    expect(passwordMatches(`${PASSWORD.slice(0, -1)}z`)).toBe(false);
  });

  it('refuses a guess of a different length', () => {
    expect(passwordMatches(`${PASSWORD}!`)).toBe(false);
    expect(passwordMatches(PASSWORD.slice(0, -1))).toBe(false);
  });

  it('compares the digests with timingSafeEqual', () => {
    const nodeCrypto = jest.requireActual<typeof import('crypto')>('crypto');
    const spy = jest.spyOn(nodeCrypto, 'timingSafeEqual');
    expect(passwordMatches(PASSWORD)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('adminReady', () => {
  it('is false when ADMIN_PASSWORD is unset', () => {
    setEnv('ADMIN_PASSWORD', undefined);
    expect(adminReady()).toBe(false);
  });

  it('is false when ADMIN_PASSWORD is shorter than 12 characters', () => {
    setEnv('ADMIN_PASSWORD', 'short-pass1');
    expect(adminReady()).toBe(false);
  });

  it('is true at exactly 12 characters', () => {
    setEnv('ADMIN_PASSWORD', 'a'.repeat(12));
    expect(adminReady()).toBe(true);
  });

  it('is false when SESSION_SECRET is unset', () => {
    setEnv('SESSION_SECRET', undefined);
    expect(adminReady()).toBe(false);
  });

  it('is true when both are configured', () => {
    expect(adminReady()).toBe(true);
  });
});

describe('signAdminToken and verifyAdminToken', () => {
  it('accepts a freshly signed token', () => {
    expect(verifyAdminToken(signAdminToken(clock.now), clock.now)).toBe(true);
  });

  it('accepts a token just inside the 8 hour lifetime', () => {
    const token = signAdminToken(clock.now);
    expect(verifyAdminToken(token, clock.now + ADMIN_SESSION_MAX_AGE_S * 1000 - 1000)).toBe(true);
  });

  it('rejects a token from 8 hours and 1 second later', () => {
    const token = signAdminToken(clock.now);
    expect(verifyAdminToken(token, clock.now + ADMIN_SESSION_MAX_AGE_S * 1000 + 1000)).toBe(false);
  });

  it('rejects a token issued 2 minutes in the future', () => {
    const token = signAdminToken(clock.now + 2 * MINUTE);
    expect(verifyAdminToken(token, clock.now)).toBe(false);
  });

  it('accepts a token issued 30 seconds in the future, within the clock allowance', () => {
    const token = signAdminToken(clock.now + 30 * 1000);
    expect(verifyAdminToken(token, clock.now)).toBe(true);
  });

  it('rejects a tampered token', () => {
    const token = signAdminToken(clock.now);
    // Flip the last 4 base64url chars. This corrupts the ciphertext and fails the GCM auth tag.
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(verifyAdminToken(tampered, clock.now)).toBe(false);
  });

  it('rejects a token signed before the password changed', () => {
    const token = signAdminToken(clock.now);
    setEnv('ADMIN_PASSWORD', 'a different password 2');
    expect(verifyAdminToken(token, clock.now)).toBe(false);
  });

  it('rejects a missing, empty or non-string token', () => {
    expect(verifyAdminToken(undefined, clock.now)).toBe(false);
    expect(verifyAdminToken('', clock.now)).toBe(false);
    expect(verifyAdminToken(42, clock.now)).toBe(false);
  });
});

describe('purpose separation', () => {
  it('rejects a player token as an admin token', () => {
    const { token } = signSession('Ahmad');
    expect(verifySession(token)).not.toBeNull();
    expect(verifyAdminToken(token, clock.now)).toBe(false);
  });

  it('rejects an admin token as a player token', () => {
    const token = signAdminToken(clock.now);
    expect(verifyAdminToken(token, clock.now)).toBe(true);
    expect(verifySession(token)).toBeNull();
  });
});

describe('adminCookie and clearedAdminCookie', () => {
  it('sets the admin cookie with its flags', () => {
    const cookie = adminCookie('token-value');
    expect(cookie).toContain('admin_session=token-value');
    for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=28800', 'Secure']) {
      expect(cookie).toContain(part);
    }
  });

  it('leaves out Secure in development', () => {
    setEnv('NODE_ENV', 'development');
    const cookie = adminCookie('token-value');
    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain('HttpOnly');
  });

  it('clears the cookie with Max-Age=0', () => {
    const cookie = clearedAdminCookie();
    expect(cookie).toContain('admin_session=');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('sameOrigin', () => {
  it('accepts an origin that names the request host', () => {
    expect(sameOrigin(req('POST', { origin: 'http://localhost' }))).toBe(true);
  });

  it('refuses an origin on another host', () => {
    expect(sameOrigin(req('POST', { origin: 'https://evil.example' }))).toBe(false);
  });

  it('refuses an origin on the same host but another port', () => {
    expect(sameOrigin(req('POST', { origin: 'http://localhost:3000' }))).toBe(false);
  });

  it('refuses a request with no origin and no referer', () => {
    expect(sameOrigin(req('POST'))).toBe(false);
  });

  it('accepts a matching referer when there is no origin', () => {
    expect(sameOrigin(req('POST', { referer: 'http://localhost/admin' }))).toBe(true);
  });

  it('uses the origin over the referer when both are present', () => {
    expect(sameOrigin(req('POST', { origin: 'https://evil.example', referer: 'http://localhost/admin' }))).toBe(false);
  });

  it('refuses a literal null origin', () => {
    expect(sameOrigin(req('POST', { origin: 'null' }))).toBe(false);
  });
});

describe('requireAdmin', () => {
  it('refuses a request with no cookie with 401', () => {
    const response = refusal(requireAdmin(req('GET')));
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses a player session token in the admin cookie with 401', () => {
    const { token } = signSession('Ahmad');
    const response = refusal(requireAdmin(req('GET', { cookie: `admin_session=${token}` })));
    expect(response.status).toBe(401);
  });

  it('admits a valid admin cookie on GET', () => {
    expect(requireAdmin(req('GET', { cookie: adminCookieHeader() }))).toEqual({ ok: true });
  });

  it('refuses a POST with a valid cookie and no origin with 403', () => {
    const response = refusal(requireAdmin(req('POST', { cookie: adminCookieHeader() })));
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses a POST with a valid cookie and another origin with 403', () => {
    const response = refusal(
      requireAdmin(req('POST', { cookie: adminCookieHeader(), origin: 'https://evil.example' })),
    );
    expect(response.status).toBe(403);
  });

  it('admits a POST with a valid cookie and a matching origin', () => {
    expect(
      requireAdmin(req('POST', { cookie: adminCookieHeader(), origin: 'http://localhost' })),
    ).toEqual({ ok: true });
  });

  it('answers 503 when ADMIN_PASSWORD is unset', () => {
    const cookie = adminCookieHeader();
    setEnv('ADMIN_PASSWORD', undefined);
    const response = refusal(requireAdmin(req('GET', { cookie })));
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
