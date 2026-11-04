'use client';

import { CARD, SUBTLE_TEXT, formatTime, type AuditEntry } from './shared';

const ACTION_LABELS: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  'clock.start': 'Clock started',
  'clock.reset': 'Clock reset',
  'prize.given': 'Prize marked given',
  'prize.cleared': 'Prize mark removed',
  'player.edit': 'Scores edited',
  'player.delete': 'Player deleted',
  'game.pause': 'Game paused',
  'game.resume': 'Game resumed',
};

const SHOWN = 20;

interface Props {
  entries: AuditEntry[];
}

export default function AuditPanel({ entries }: Props) {
  // Newest first, then the most recent 20.
  const recent = [...entries].sort((a, b) => b.at - a.at).slice(0, SHOWN);

  return (
    <section aria-labelledby="audit-heading" className={CARD}>
      <h2 id="audit-heading" className="text-lg font-extrabold text-ink">
        Recent actions
      </h2>
      {recent.length === 0 ? (
        <p className={`${SUBTLE_TEXT} mt-3`}>No actions yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {recent.map((entry, index) => (
            <li key={`${entry.at}-${entry.action}-${index}`} className="py-3 text-sm text-ink">
              <span className="tabular-nums text-muted">{formatTime(entry.at)}</span>
              <span className="text-muted"> · </span>
              <span className="font-semibold">{ACTION_LABELS[entry.action] ?? entry.action}</span>
              {entry.target && (
                <>
                  <span className="text-muted"> · </span>
                  <span className="break-words">{entry.target}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
