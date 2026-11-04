import { adminError, adminJson } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { appendAudit } from '@/lib/admin/audit';
import { setMasked } from '@/lib/mask';
import { readJsonObject } from '@/lib/runs/http';

/** Masks or unmasks the public leaderboard. Body: { masked: boolean }. */
export async function POST(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const body = await readJsonObject(request);
  if (!body) return adminError(400, 'Invalid JSON');
  const masked = body.masked;
  if (typeof masked !== 'boolean') return adminError(400, 'masked must be true or false.');

  try {
    await setMasked(masked);
    await appendAudit(masked ? 'leaderboard.mask' : 'leaderboard.unmask', 'leaderboard', Date.now());
    return adminJson({ masked });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
