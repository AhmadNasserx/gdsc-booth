import { adminError, adminJson } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { appendAudit } from '@/lib/admin/audit';
import { clearPauseCache } from '@/lib/config';
import { adminDb } from '@/lib/firebaseAdmin';
import { readJsonObject } from '@/lib/runs/http';

export async function POST(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const body = await readJsonObject(request);
  if (!body) return adminError(400, 'Invalid JSON');

  const paused = body.paused;
  if (typeof paused !== 'boolean') return adminError(400, 'paused must be true or false.');

  const now = Date.now();
  try {
    await adminDb.ref('config/paused').set(paused);
    clearPauseCache();
    await appendAudit(paused ? 'game.pause' : 'game.resume', 'game', now);
    return adminJson({ paused });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
