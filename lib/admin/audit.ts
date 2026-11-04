import { adminDb } from '../firebaseAdmin';

export type AdminAction =
  | 'login'
  | 'logout'
  | 'clock.start'
  | 'clock.reset'
  | 'prize.given'
  | 'prize.cleared'
  | 'player.edit'
  | 'player.delete'
  | 'game.pause'
  | 'game.resume'
  | 'leaderboard.mask'
  | 'leaderboard.unmask';

export interface AuditEntry {
  at: number;
  action: AdminAction;
  target: string;
}

/** Appends one admin action to the log. Only the time, the action and the target are stored. */
export async function appendAudit(action: AdminAction, target: string, now: number): Promise<void> {
  await adminDb.ref('admin-log').push({ at: now, action, target });
}

/** The most recent admin actions, newest first. */
export async function recentAudit(limit = 20): Promise<AuditEntry[]> {
  const snap = await adminDb.ref('admin-log').get();
  const stored = (snap.val() ?? {}) as Record<string, AuditEntry>;
  return Object.values(stored)
    .filter(
      (entry) =>
        !!entry &&
        typeof entry.at === 'number' &&
        typeof entry.action === 'string' &&
        typeof entry.target === 'string',
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}
