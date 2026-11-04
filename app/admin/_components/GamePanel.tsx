'use client';

import { useState } from 'react';
import {
  BUTTON_PRIMARY,
  BUTTON_WARNING,
  CARD,
  ERROR_TEXT,
  SUBTLE_TEXT,
  callApi,
  isUnauthorized,
} from './shared';

interface Props {
  paused: boolean;
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

export default function GamePanel({ paused, onChanged, onUnauthorized }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await callApi('/api/admin/pause', { method: 'POST', body: { paused: !paused } });
    if (isUnauthorized(result)) {
      onUnauthorized();
      return;
    }
    setBusy(false);
    if (result.ok) await onChanged();
    else setError(result.error);
  }

  return (
    <section aria-labelledby="game-heading" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="game-heading" className="text-lg font-extrabold text-ink">
          Game
        </h2>
        {paused ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sci-soft px-3 py-1 text-sm font-bold text-sci-ink">
            <span className="h-2 w-2 rounded-full bg-[#B06000]" />
            Paused
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-3 py-1 text-sm font-bold text-[#34A853]">
            <span className="h-2 w-2 rounded-full bg-[#34A853]" />
            Live
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`${paused ? BUTTON_PRIMARY : BUTTON_WARNING} mt-4 w-full min-h-[56px] text-lg`}
      >
        {busy ? 'Saving...' : paused ? 'Resume game' : 'Pause game'}
      </button>
      <p className={`${SUBTLE_TEXT} mt-3`}>
        While paused, nobody can start or play a game. The leaderboard stays live.
      </p>
      {error && (
        <p role="alert" className={`${ERROR_TEXT} mt-3`}>
          {error}
        </p>
      )}
    </section>
  );
}
