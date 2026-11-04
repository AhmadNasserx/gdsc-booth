'use client';
/* eslint-disable @next/next/no-img-element -- static logos on a full-screen presenter page */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeaderboardResponse, RoundResult } from '@/lib/apiTypes';
import { hourWinners, reelNames, topFinishers } from '@/lib/announce';
import { mountCeremony, type CeremonyOptions } from './ceremony';
import './announce.css';

/** How many players the day's ceremony reveals. */
const DAY_COUNT = 9;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Choice = { kind: 'day' } | { kind: 'hour'; round: RoundResult };

/** Builds what the ceremony shows for a choice, from the scores as they are now. */
function optionsFor(choice: Choice, data: LeaderboardResponse): CeremonyOptions {
  const pool = reelNames(data.entries);
  if (choice.kind === 'day') {
    const winners = topFinishers(data.entries, DAY_COUNT);
    return {
      winners,
      pool,
      eyebrow: 'Open Doors 2026 · Faculty of Science',
      title: `Meet the Top ${winners.length}`,
      subtitle: '3 games. One leaderboard. These players finished all three and climbed to the top.',
    };
  }
  const { round } = choice;
  return {
    winners: hourWinners(round),
    pool,
    eyebrow: `Hour ${round.round} · ${clock(round.start)}–${clock(round.end)}`,
    title: `Hour ${round.round} winners`,
    subtitle: 'The top 3 players of this hour win a prize. Let’s find out who they are.',
  };
}

export default function AnnouncePage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState<CeremonyOptions | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch('/api/leaderboard', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: LeaderboardResponse) => {
        if (!body || !Array.isArray(body.entries) || !Array.isArray(body.rounds)) throw new Error('bad reply');
        setData(body);
        setError('');
        setLoadedAt(Date.now());
      })
      .catch(() => setError('Couldn’t load the leaderboard. Check the connection and try again.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The ceremony runs on a frozen copy of the scores, so a late score can't change it halfway.
  useEffect(() => {
    if (!show || !stageRef.current) return;
    return mountCeremony(stageRef.current, show, () => setShow(null));
  }, [show]);

  if (show) return <div ref={stageRef} className="ann" />;

  const finishers = data ? topFinishers(data.entries, DAY_COUNT) : [];
  const hours = data ? [...data.rounds].filter((r) => r.top.length > 0).sort((a, b) => b.round - a.round) : [];

  return (
    <main className="min-h-screen bg-[#120a2e] px-5 py-8 text-[#f6f3ff] md:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5">
          <img src="/brand/bau-logo.png" alt="Beirut Arab University" className="h-9 w-auto" />
          <span className="h-8 w-px bg-line" aria-hidden="true" />
          <img src="/brand/open-doors-2026.png" alt="Open Doors 2026" className="h-11 w-auto" />
        </div>

        <p className="font-display mt-8 text-sm font-semibold tracking-[0.2em] text-sci">Faculty of Science · Presenter</p>
        <h1 className="font-display mt-2 text-5xl font-bold md:text-7xl">Announce the winners</h1>
        <p className="mt-3 max-w-xl text-base text-[#a9a0cf]">
          Pick what to reveal. The ceremony takes the scores as they are when it starts. Press Space or click to
          reveal each winner, ← to go back, F for fullscreen and Esc to come back here.
        </p>

        {error && (
          <p role="alert" className="mt-6 rounded-2xl border border-coral bg-coral/15 p-4 text-sm font-semibold">
            {error}
          </p>
        )}

        {!data && !error && <p className="mt-8 text-[#a9a0cf]">Loading the leaderboard…</p>}

        {data && (
          <>
            <button
              type="button"
              disabled={finishers.length === 0}
              onClick={() => setShow(optionsFor({ kind: 'day' }, data))}
              className="mt-8 flex w-full items-center justify-between gap-4 rounded-3xl bg-sci p-6 text-left text-ink shadow-[0_8px_0_#DE9F00] transition-all hover:bg-sci-deep active:translate-y-1 disabled:opacity-50"
            >
              <span>
                <span className="font-display block text-3xl font-bold md:text-4xl">Top {DAY_COUNT} of the day</span>
                <span className="mt-1 block text-sm font-semibold">
                  {finishers.length === 0
                    ? 'No one has finished all three games yet.'
                    : `Counts down from #${finishers.length} to the champion. Players who finished all three games.`}
                </span>
              </span>
              <span className="font-display text-4xl" aria-hidden="true">→</span>
            </button>

            <h2 className="font-display mt-10 text-2xl font-bold">Hourly winners</h2>
            {hours.length === 0 ? (
              <p className="mt-3 text-[#a9a0cf]">No hour has winners yet.</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {hours.map((round) => (
                  <li key={round.round}>
                    <button
                      type="button"
                      onClick={() => setShow(optionsFor({ kind: 'hour', round }, data))}
                      className="w-full rounded-2xl border-2 border-[#3a2d7a] bg-[#251a5c] p-4 text-left transition-colors hover:border-sci"
                    >
                      <span className="font-display block text-xl font-bold">
                        Hour {round.round}
                        {round.round === data.event.currentRound ? ' · live' : ''}
                      </span>
                      <span className="block text-sm text-[#a9a0cf] tabular-nums">
                        {clock(round.start)}–{clock(round.end)} · {round.top.length} winner{round.top.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-[#a9a0cf]">
              <button
                type="button"
                onClick={load}
                className="rounded-full border border-[#3a2d7a] px-4 py-2 font-bold text-[#f6f3ff] hover:border-sci"
              >
                Refresh scores
              </button>
              {loadedAt !== null && <span>Scores loaded at {new Date(loadedAt).toLocaleTimeString()}</span>}
            </div>
            <p className="mt-6 text-xs text-[#a9a0cf]">
              Confirm each winner in person before handing over a prize.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

