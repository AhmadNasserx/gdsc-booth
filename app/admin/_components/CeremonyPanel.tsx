'use client';

import { useState } from 'react';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, BUTTON_WARNING, CARD, ERROR_TEXT, SUBTLE_TEXT, callApi, isUnauthorized } from './shared';

interface Props {
  masked: boolean;
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

/** Hides the public leaderboard for a winners ceremony, and links to the ceremony and booth screens. */
export default function CeremonyPanel({ masked, onChanged, onUnauthorized }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await callApi('/api/admin/mask', { method: 'POST', body: { masked: !masked } });
    if (isUnauthorized(result)) {
      onUnauthorized();
      return;
    }
    setBusy(false);
    if (result.ok) await onChanged();
    else setError(result.error);
  }

  return (
    <section aria-labelledby="ceremony-heading" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="ceremony-heading" className="text-lg font-extrabold text-ink">
          Winners ceremony
        </h2>
        {masked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo px-3 py-1 text-sm font-bold text-sci">
            <span className="h-2 w-2 rounded-full bg-sci" />
            Leaderboard hidden
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-3 py-1 text-sm font-bold text-[#34A853]">
            <span className="h-2 w-2 rounded-full bg-[#34A853]" />
            Leaderboard visible
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`${masked ? BUTTON_PRIMARY : BUTTON_WARNING} mt-4 w-full min-h-[56px] text-lg`}
      >
        {busy ? 'Saving...' : masked ? 'Show the leaderboard again' : 'Hide the leaderboard'}
      </button>
      <p className={`${SUBTLE_TEXT} mt-3`}>
        Hiding replaces names and scores on the public leaderboard with a “winners coming up” screen. The game keeps
        running and every score still counts.
      </p>

      <a href="/announce" className={`${BUTTON_SECONDARY} mt-4 flex w-full items-center justify-center`}>
        Open the ceremony (/announce)
      </a>
      <p className={`${SUBTLE_TEXT} mt-2`}>
        Reveal the top 3, 5, 9 or 10 at any time, for the whole day, for one hour, or for players who finished since a
        time you choose.
      </p>
      {error && (
        <p role="alert" className={`${ERROR_TEXT} mt-3`}>
          {error}
        </p>
      )}
    </section>
  );
}
