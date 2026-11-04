import { adminError, adminJson } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { readWinnerRounds } from '@/lib/admin/winners';

export async function GET(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const now = Date.now();
  try {
    const { startedAt, rounds } = await readWinnerRounds(now);
    return adminJson({ startedAt, rounds });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
