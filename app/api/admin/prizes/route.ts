import { adminError, adminJson, isNormKey, isRound } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { appendAudit } from '@/lib/admin/audit';
import { setPrizeGiven } from '@/lib/admin/winners';
import { readJsonObject } from '@/lib/runs/http';

export async function POST(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const body = await readJsonObject(request);
  if (!body) return adminError(400, 'Invalid JSON');

  const round = body.round;
  const key = body.key;
  const given = body.given;
  if (!isRound(round) || !isNormKey(key) || typeof given !== 'boolean') {
    return adminError(400, 'Invalid prize update.');
  }

  const now = Date.now();
  try {
    const result = await setPrizeGiven(round, key, given, now);
    if (result === 'ok') {
      await appendAudit(given ? 'prize.given' : 'prize.cleared', `hour ${round} ${key}`, now);
      return adminJson({ ok: true });
    }
    if (result === 'not-started') return adminError(409, 'The event has not started.');
    if (result === 'round-not-reached') return adminError(409, 'That round has not started yet.');
    return adminError(404, 'Player not found.');
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
