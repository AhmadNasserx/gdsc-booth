import { adminError, adminJson, isNormKey } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { appendAudit } from '@/lib/admin/audit';
import { deletePlayer, editPlayerGames, listPlayers, parseGameEdits } from '@/lib/admin/players';
import { readJsonObject } from '@/lib/runs/http';

export async function GET(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const now = Date.now();
  try {
    const players = await listPlayers(now);
    return adminJson({ players });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}

export async function PATCH(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const body = await readJsonObject(request);
  if (!body) return adminError(400, 'Invalid JSON');

  const key = body.key;
  if (!isNormKey(key)) return adminError(400, 'Invalid player.');

  const parsed = parseGameEdits(body.games);
  if (!parsed.ok) return adminError(400, parsed.error);

  const now = Date.now();
  try {
    const player = await editPlayerGames(key, parsed.edits, now);
    if (!player) return adminError(404, 'Player not found.');
    await appendAudit('player.edit', key, now);
    return adminJson({ player });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}

export async function DELETE(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const body = await readJsonObject(request);
  if (!body) return adminError(400, 'Invalid JSON');

  const key = body.key;
  if (!isNormKey(key)) return adminError(400, 'Invalid player.');

  const now = Date.now();
  try {
    const removed = await deletePlayer(key);
    if (!removed) return adminError(404, 'Player not found.');
    await appendAudit('player.delete', key, now);
    return adminJson({ ok: true, removed });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
