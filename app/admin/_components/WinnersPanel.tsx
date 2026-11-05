'use client';

import { useEffect, useState } from 'react';
import {
  BUTTON_SECONDARY,
  CARD,
  ERROR_TEXT,
  SUBTLE_TEXT,
  callApi,
  formatClock,
  isUnauthorized,
  omitKey,
  type WinnerRound,
  type WinnerRow,
} from './shared';

interface Props {
  rounds: WinnerRound[];
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

function prizeId(round: number, normKey: string): string {
  return `${round}:${normKey}`;
}

export default function WinnersPanel({ rounds, onChanged, onUnauthorized }: Props) {
  // Checkbox values shown before the server confirms them.
  const [pendingPrize, setPendingPrize] = useState<Record<string, boolean>>({});
  const [prizeErrors, setPrizeErrors] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (copiedId === null) return;
    const timer = setTimeout(() => setCopiedId(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const newestFirst = [...rounds].sort((a, b) => b.round - a.round);

  async function setPrizeGiven(round: number, winner: WinnerRow, given: boolean) {
    const id = prizeId(round, winner.normKey);
    setPendingPrize((current) => ({ ...current, [id]: given }));
    setPrizeErrors((current) => omitKey(current, id));

    const result = await callApi('/api/admin/prizes', {
      method: 'POST',
      body: { round, key: winner.normKey, given },
    });
    if (isUnauthorized(result)) {
      onUnauthorized();
      return;
    }
    if (!result.ok) {
      setPendingPrize((current) => omitKey(current, id));
      setPrizeErrors((current) => ({ ...current, [id]: result.error }));
      return;
    }
    await onChanged();
    setPendingPrize((current) => omitKey(current, id));
  }

  async function copyPhone(id: string, phone: string) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(id);
    } catch {
      // The clipboard refused the copy. Nothing to show.
    }
  }

  return (
    <section aria-labelledby="winners-heading" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="winners-heading" className="text-lg font-extrabold text-ink">
          Round winners
        </h2>
        <a href="/api/admin/export" download className={BUTTON_SECONDARY}>
          Download winners CSV
        </a>
      </div>

      {newestFirst.length === 0 ? (
        <p className={`${SUBTLE_TEXT} mt-4`}>No finished players yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {newestFirst.map((round) => (
            <article
              key={round.round}
              aria-label={`Round ${round.round}`}
              className="rounded-2xl border border-line bg-mist p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-extrabold text-ink">Round {round.round}</h3>
                {round.current && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-2.5 py-1 text-xs font-bold text-[#34A853]">
                    <span className="h-2 w-2 rounded-full bg-[#34A853]" />
                    Live
                  </span>
                )}
              </div>
              <p className={`${SUBTLE_TEXT} mt-1 tabular-nums`}>
                {formatClock(round.start)} to {formatClock(round.end)}
              </p>

              {round.winners.length === 0 ? (
                <p className={`${SUBTLE_TEXT} mt-3`}>No finished players yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {round.winners.map((winner) => {
                    const id = prizeId(round.round, winner.normKey);
                    const given = pendingPrize[id] ?? winner.prizeGiven;
                    const saving = id in pendingPrize;
                    const copyId = `copy-${id}`;
                    const phone = winner.phone;
                    return (
                      <li key={winner.normKey} className="rounded-2xl bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-4">
                          <span className="w-12 shrink-0 text-4xl font-black leading-none tabular-nums text-ink">
                            {winner.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-lg font-bold text-ink">{winner.name}</p>
                            <p className={`${SUBTLE_TEXT} tabular-nums`}>{winner.score} points</p>
                            {(winner.school || winner.level) && (
                              <p className="mt-0.5 text-sm font-semibold text-indigo">
                                {[winner.school, winner.level].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {phone ? (
                              <a
                                href={`tel:${phone}`}
                                className="mt-1 inline-flex min-h-[44px] items-center break-all text-base font-semibold text-ink underline"
                              >
                                {phone}
                              </a>
                            ) : (
                              <p className={`${SUBTLE_TEXT} mt-1`}>No number on file</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {phone && (
                            <button
                              type="button"
                              onClick={() => copyPhone(copyId, phone)}
                              className={BUTTON_SECONDARY}
                            >
                              {copiedId === copyId ? 'Copied' : 'Copy'}
                            </button>
                          )}
                          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-base font-semibold text-ink">
                            <input
                              type="checkbox"
                              checked={given}
                              disabled={saving}
                              onChange={(e) => setPrizeGiven(round.round, winner, e.target.checked)}
                              className="h-5 w-5 accent-sci-deep"
                            />
                            Prize given
                          </label>
                        </div>
                        {prizeErrors[id] && (
                          <p role="alert" className={`${ERROR_TEXT} mt-2`}>
                            {prizeErrors[id]}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
