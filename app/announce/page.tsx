'use client';
/* eslint-disable @next/next/no-img-element -- static logos on a full-screen presenter page */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LeaderboardResponse, RoundResult } from '@/lib/apiTypes';
import { hourWinners, reelNames, topFinishers } from '@/lib/announce';
import { mountCeremony, type CeremonyOptions } from './ceremony';
import './announce.css';

/** How many winners a ceremony can reveal, for the day or for a stretch of time. */
const COUNTS = [3, 5, 9, 10] as const;
/** The default start of "since a time": this long before now. */
const DEFAULT_SINCE_MS = 30 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Today at the given "HH:MM", in local time, or null when the text is not a time. */
function todayAt(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const d = new Date();
  d.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return d.getTime();
}

type Choice = { kind: 'day'; count: number } | { kind: 'since'; count: number; since: number } | { kind: 'hour'; round: RoundResult };

/** Builds what the ceremony shows for a choice, from the scores as they are now. */
function optionsFor(choice: Choice, data: LeaderboardResponse): CeremonyOptions {
  const pool = reelNames(data.entries);
  if (choice.kind === 'hour') {
    const { round } = choice;
    return {
      winners: hourWinners(round),
      pool,
      eyebrow: `Hour ${round.round} · ${clock(round.start)}–${clock(round.end)}`,
      title: `Hour ${round.round} winners`,
      subtitle: 'The top 3 players of this hour win a prize. Let’s find out who they are.',
    };
  }
  const since = choice.kind === 'since' ? choice.since : undefined;
  const winners = topFinishers(data.entries, choice.count, since);
  return {
    winners,
    pool,
    eyebrow: since === undefined ? 'Open Doors 2026 · Faculty of Science' : `Since ${clock(since)} · Faculty of Science`,
    title: `Meet the Top ${winners.length}`,
    subtitle:
      since === undefined
        ? '3 games. One leaderboard. These players finished all three and climbed to the top.'
        : `The best players who finished all three games since ${clock(since)}.`,
  };
}

type Load = { state: 'loading' } | { state: 'signin' } | { state: 'error'; message: string } | { state: 'ready'; data: LeaderboardResponse; at: number };

export default function AnnouncePage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [show, setShow] = useState<CeremonyOptions | null>(null);
  const [count, setCount] = useState<number>(9);
  const [sinceText, setSinceText] = useState(() => clock(Date.now() - DEFAULT_SINCE_MS));
  const [hideBoard, setHideBoard] = useState(true);
  const [maskBusy, setMaskBusy] = useState(false);
  const [maskError, setMaskError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);

  // The full board comes from the admin route, so it is there even while the public board is hidden.
  const refresh = useCallback(() => {
    fetch('/api/admin/leaderboard', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) return setLoad({ state: 'signin' });
        const body = (await r.json()) as LeaderboardResponse & { error?: string };
        if (!r.ok || !Array.isArray(body.entries) || !Array.isArray(body.rounds)) {
          throw new Error(body?.error ?? 'bad reply');
        }
        setLoad({ state: 'ready', data: body, at: Date.now() });
      })
      .catch(() => setLoad({ state: 'error', message: 'Couldn’t load the leaderboard. Check the connection and try again.' }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The ceremony runs on a frozen copy of the scores, so a late score can't change it halfway.
  useEffect(() => {
    if (!show || !stageRef.current) return;
    return mountCeremony(stageRef.current, show, () => {
      setShow(null);
      refresh();
    });
  }, [show, refresh]);

  async function setMask(masked: boolean): Promise<boolean> {
    setMaskBusy(true);
    setMaskError('');
    try {
      const res = await fetch('/api/admin/mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masked }),
      });
      if (res.status === 401) {
        setLoad({ state: 'signin' });
        return false;
      }
      if (!res.ok) throw new Error();
      setLoad((current) => (current.state === 'ready' ? { ...current, data: { ...current.data, masked } } : current));
      return true;
    } catch {
      setMaskError('Couldn’t change the leaderboard. Try again.');
      return false;
    } finally {
      setMaskBusy(false);
    }
  }

  async function start(choice: Choice) {
    if (load.state !== 'ready') return;
    if (hideBoard && !load.data.masked) await setMask(true);
    setShow(optionsFor(choice, load.data));
  }

  if (show) return <div ref={stageRef} className="ann" />;

  const data = load.state === 'ready' ? load.data : null;
  const loadedAt = load.state === 'ready' ? load.at : 0;
  const since = todayAt(sinceText);
  const dayWinners = data ? topFinishers(data.entries, count) : [];
  const sinceWinners = data && since !== null ? topFinishers(data.entries, count, since) : [];
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
          Choose what to reveal, whenever you are ready. The ceremony takes the scores as they are when it starts.
          Space or click reveals each winner, ← goes back, F is fullscreen and Esc comes back here.
        </p>

        {load.state === 'loading' && <p className="mt-8 text-[#a9a0cf]">Loading the leaderboard…</p>}

        {load.state === 'signin' && (
          <div className="mt-8 rounded-3xl border-2 border-[#3a2d7a] bg-[#251a5c] p-6">
            <p className="font-display text-2xl font-bold">Staff only</p>
            <p className="mt-2 text-[#a9a0cf]">Sign in with the admin password to run the ceremony.</p>
            <a
              href="/admin/login?next=/announce"
              className="font-display mt-4 inline-flex rounded-2xl bg-sci px-6 py-3 text-lg font-bold text-ink hover:bg-sci-deep"
            >
              Sign in
            </a>
          </div>
        )}

        {load.state === 'error' && (
          <p role="alert" className="mt-6 rounded-2xl border border-coral bg-coral/15 p-4 text-sm font-semibold">
            {load.message}
          </p>
        )}

        {data && (
          <>
            <section
              className={`mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 p-5 ${
                data.masked ? 'border-sci bg-sci/10' : 'border-[#3a2d7a] bg-[#251a5c]'
              }`}
            >
              <div>
                <p className="font-display text-xl font-bold">
                  {data.masked ? 'Public leaderboard: hidden' : 'Public leaderboard: visible'}
                </p>
                <p className="text-sm text-[#a9a0cf]">
                  {data.masked
                    ? 'The big screen and phones show “Winners coming up…”. Scores still count.'
                    : 'Names and scores are on the big screen and on phones.'}
                </p>
              </div>
              <button
                type="button"
                disabled={maskBusy}
                onClick={() => void setMask(!data.masked)}
                className={`font-display rounded-2xl px-5 py-3 text-lg font-bold disabled:opacity-60 ${
                  data.masked ? 'bg-white text-ink hover:bg-sci-soft' : 'bg-sci text-ink hover:bg-sci-deep'
                }`}
              >
                {maskBusy ? 'Saving…' : data.masked ? 'Show it again' : 'Hide it now'}
              </button>
              {maskError && (
                <p role="alert" className="w-full text-sm font-semibold text-coral">
                  {maskError}
                </p>
              )}
            </section>

            <label className="mt-4 flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={hideBoard}
                onChange={(e) => setHideBoard(e.target.checked)}
                className="h-5 w-5 accent-sci"
              />
              Hide the public leaderboard when a ceremony starts
            </label>

            <fieldset className="mt-8">
              <legend className="font-display text-2xl font-bold">How many winners?</legend>
              <div role="radiogroup" aria-label="How many winners?" className="mt-3 flex flex-wrap gap-2">
                {COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={count === n}
                    onClick={() => setCount(n)}
                    className={`font-display min-w-16 rounded-2xl border-2 px-5 py-2 text-2xl font-bold ${
                      count === n ? 'border-sci bg-sci text-ink' : 'border-[#3a2d7a] bg-[#251a5c] hover:border-sci'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              disabled={dayWinners.length === 0}
              onClick={() => void start({ kind: 'day', count })}
              className="mt-6 flex w-full items-center justify-between gap-4 rounded-3xl bg-sci p-6 text-left text-ink shadow-[0_8px_0_#DE9F00] transition-all hover:bg-sci-deep active:translate-y-1 disabled:opacity-50"
            >
              <span>
                <span className="font-display block text-3xl font-bold md:text-4xl">Top {count} so far today</span>
                <span className="mt-1 block text-sm font-semibold">
                  {dayWinners.length === 0
                    ? 'No one has finished all three games yet.'
                    : `Counts down from #${dayWinners.length} to the champion. Players who finished all three games.`}
                </span>
              </span>
              <span className="font-display text-4xl" aria-hidden="true">→</span>
            </button>

            <div className="mt-4 rounded-3xl border-2 border-[#3a2d7a] bg-[#251a5c] p-5">
              <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                  <span className="font-display block text-xl font-bold">Top {count} since</span>
                  <input
                    id="since"
                    type="time"
                    value={sinceText}
                    onChange={(e) => setSinceText(e.target.value)}
                    className="mt-2 rounded-xl border border-[#3a2d7a] bg-[#120a2e] px-3 py-2 text-lg text-white [color-scheme:dark]"
                  />
                </label>
                <button
                  type="button"
                  disabled={sinceWinners.length === 0}
                  onClick={() => since !== null && void start({ kind: 'since', count, since })}
                  className="font-display rounded-2xl bg-white px-5 py-3 text-lg font-bold text-ink hover:bg-sci-soft disabled:opacity-40"
                >
                  Start →
                </button>
              </div>
              <p className="mt-2 text-sm text-[#a9a0cf]">
                {since === null
                  ? 'Choose a time.'
                  : sinceWinners.length === 0
                    ? `No one has finished all three games since ${sinceText}.`
                    : `${sinceWinners.length} player${sinceWinners.length === 1 ? '' : 's'} to reveal. Use it to announce early, before the hour is up, or for any part of the day.`}
              </p>
            </div>

            <h2 className="font-display mt-10 text-2xl font-bold">Hourly prize winners</h2>
            {hours.length === 0 ? (
              <p className="mt-3 text-[#a9a0cf]">No hour has winners yet.</p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {hours.map((round) => (
                  <li key={round.round}>
                    <button
                      type="button"
                      onClick={() => void start({ kind: 'hour', round })}
                      className="w-full rounded-2xl border-2 border-[#3a2d7a] bg-[#251a5c] p-4 text-left transition-colors hover:border-sci"
                    >
                      <span className="font-display block text-xl font-bold">
                        Hour {round.round}
                        {round.round === data.event.currentRound ? ' · so far' : ''}
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
                onClick={refresh}
                className="rounded-full border border-[#3a2d7a] px-4 py-2 font-bold text-[#f6f3ff] hover:border-sci"
              >
                Refresh scores
              </button>
              <span>Scores loaded at {new Date(loadedAt).toLocaleTimeString()}</span>
              <a href="/admin" className="underline decoration-sci underline-offset-4">
                Admin panel
              </a>
            </div>
            <p className="mt-6 text-xs text-[#a9a0cf]">Confirm each winner in person before handing over a prize.</p>
          </>
        )}
      </div>
    </main>
  );
}
