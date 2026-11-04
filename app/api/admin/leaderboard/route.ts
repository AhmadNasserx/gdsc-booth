import { adminError, adminJson } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { readLeaderboard } from '@/lib/leaderboard';
import { isMasked } from '@/lib/mask';

/** The full leaderboard for the winners ceremony, readable even while the public board is masked. */
export async function GET(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;
  try {
    const now = Date.now();
    const [board, masked] = await Promise.all([readLeaderboard(now), isMasked()]);
    return adminJson({ ...board, masked });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
