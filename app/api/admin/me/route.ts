import { adminJson } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';

export async function GET(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  return adminJson({ ok: true });
}
