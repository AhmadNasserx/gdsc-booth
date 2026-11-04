import { adminError, adminJson } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { appendAudit } from '@/lib/admin/audit';
import { adminDb } from '@/lib/firebaseAdmin';
import { ensureEventStarted, readEventStart } from '@/lib/event';
import { readJsonObject } from '@/lib/runs/http';

export async function POST(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const body = await readJsonObject(request);
  if (!body) return adminError(400, 'Invalid JSON');

  const now = Date.now();
  try {
    if (body.action === 'start') {
      const before = await readEventStart();
      let startedAt = before.startedAt;
      if (startedAt === null) {
        startedAt = await ensureEventStarted(now);
        await appendAudit('clock.start', 'event', now);
      }
      return adminJson({ startedAt });
    }

    if (body.action === 'reset') {
      if (body.confirm !== 'RESET') return adminError(400, 'Type RESET to confirm.');
      await adminDb.ref('event/startedAt').remove();
      await appendAudit('clock.reset', 'event', now);
      return adminJson({ startedAt: null });
    }

    return adminError(400, 'Unknown action.');
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
