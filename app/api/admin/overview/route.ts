import { adminError, adminJson } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { recentAudit } from '@/lib/admin/audit';
import { isPaused } from '@/lib/config';
import { isMasked } from '@/lib/mask';
import { currentRound, readEventStart, ROUND_MS, roundWindow } from '@/lib/event';
import type { EventInfo } from '@/lib/apiTypes';

export async function GET(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const now = Date.now();
  try {
    const [paused, masked, audit, state] = await Promise.all([isPaused(), isMasked(), recentAudit(20), readEventStart()]);
    const { startedAt } = state;
    const current = currentRound(startedAt, now);
    const event: EventInfo = {
      startedAt,
      now,
      roundMs: ROUND_MS,
      currentRound: current,
      roundEndsAt: startedAt !== null && current !== null ? roundWindow(startedAt, current).end : null,
    };
    return adminJson({ event, paused, masked, audit });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
