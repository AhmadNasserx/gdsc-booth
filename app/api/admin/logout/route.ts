import { adminError, adminJson } from '@/lib/admin/http';
import { clearedAdminCookie, requireAdmin } from '@/lib/admin/auth';
import { appendAudit } from '@/lib/admin/audit';

export async function POST(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const now = Date.now();
  try {
    await appendAudit('logout', 'admin', now);
    const res = adminJson({ ok: true });
    res.headers.set('Set-Cookie', clearedAdminCookie());
    return res;
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
