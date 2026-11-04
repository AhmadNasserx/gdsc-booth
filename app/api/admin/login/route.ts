import { adminError, adminJson } from '@/lib/admin/http';
import {
  adminCookie,
  adminReady,
  failureDelay,
  passwordMatches,
  sameOrigin,
  signAdminToken,
} from '@/lib/admin/auth';
import { clearFailures, lockedUntil, recordFailure } from '@/lib/admin/lockout';
import { appendAudit } from '@/lib/admin/audit';
import { readJsonObject } from '@/lib/runs/http';

export async function POST(request: Request) {
  const now = Date.now();
  if (!sameOrigin(request)) return adminError(403, 'Request not allowed.');
  if (!adminReady()) return adminError(503, 'Admin login is not set up.');

  const body = await readJsonObject(request);
  const password = body?.password;
  if (typeof password !== 'string' || password.length === 0 || password.length > 200) {
    return adminError(400, 'Enter the password.');
  }

  try {
    const until = await lockedUntil(now);
    if (until !== null) {
      await failureDelay();
      return adminError(429, 'Too many attempts. Try again later.', {
        'Retry-After': String(Math.max(1, Math.ceil((until - now) / 1000))),
      });
    }

    if (!passwordMatches(password)) {
      await recordFailure(now);
      await failureDelay();
      return adminError(401, 'Incorrect password.');
    }

    await clearFailures();
    await appendAudit('login', 'admin', now);
    const res = adminJson({ ok: true });
    res.headers.set('Set-Cookie', adminCookie(signAdminToken(now)));
    return res;
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
