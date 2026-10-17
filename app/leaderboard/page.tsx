'use client';

import { useCallback, useEffect, useState } from 'react';
import LeaderboardTable from '@/components/LeaderboardTable';
import { useIsBrowser } from '@/lib/clientSession';
import type { LeaderboardEntry } from '@/lib/types';

const PIN_KEY = 'leaderboardPin';

function savedPin(): string {
  try {
    return sessionStorage.getItem(PIN_KEY) ?? '';
  } catch {
    return '';
  }
}

function savePin(pin: string) {
  try {
    if (pin) sessionStorage.setItem(PIN_KEY, pin);
    else sessionStorage.removeItem(PIN_KEY);
  } catch {
    // Without storage the PIN is asked for again after a reload.
  }
}

/** The leaderboard is hidden until the right PIN is entered. */
export default function LeaderboardPage() {
  const isBrowser = useIsBrowser();
  const [pin, setPin] = useState<string | null>(null);
  // Until the player types or unlocks, the PIN saved for this tab (if any) is used.
  const activePin = pin ?? (isBrowser ? savedPin() : '');
  const lock = useCallback(() => {
    savePin('');
    setPin('');
  }, []);
  if (!isBrowser) return null;
  if (!activePin) {
    return (
      <PinGate
        onUnlock={(value) => {
          savePin(value);
          setPin(value);
        }}
      />
    );
  }
  return (
    <Board pin={activePin} onLocked={lock} />
  );
}

async function fetchBoard(pin: string): Promise<{ ok: true; entries: LeaderboardEntry[] } | { ok: false; wrongPin: boolean }> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.status === 403) return { ok: false, wrongPin: true };
    if (!res.ok) return { ok: false, wrongPin: false };
    return { ok: true, entries: (await res.json()) as LeaderboardEntry[] };
  } catch {
    return { ok: false, wrongPin: false };
  }
}

function PinGate({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const pin = value.trim();
    if (!pin || checking) return;
    setChecking(true);
    setError('');
    const result = await fetchBoard(pin);
    if (result.ok) {
      onUnlock(pin);
      return;
    }
    setError(result.wrongPin ? 'Wrong PIN. Try again.' : "Couldn't reach the server. Try again.");
    setChecking(false);
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-[#DADCE0] rounded-3xl p-8 shadow-sm text-center space-y-4">
        <p className="text-5xl" aria-hidden="true">🔒</p>
        <h1 className="text-2xl font-extrabold text-[#202124]">Leaderboard is hidden</h1>
        <p className="text-sm text-[#5F6368]">Enter the PIN to reveal it.</p>
        <label className="block">
          <span className="sr-only">PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full min-h-12 text-center text-xl tracking-widest border border-[#DADCE0] rounded-xl px-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40"
          />
        </label>
        {error && <p role="alert" className="text-sm text-[#EA4335]">{error}</p>}
        <button
          type="submit"
          disabled={!value.trim() || checking}
          className="min-h-12 w-full rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40"
        >
          {checking ? 'Checking…' : 'Reveal'}
        </button>
      </form>
    </div>
  );
}

function Board({ pin, onLocked }: { pin: string; onLocked: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    let current = true;
    const load = () =>
      fetchBoard(pin).then((result) => {
        if (!current) return;
        if (result.ok) {
          setEntries(result.entries);
          setLastUpdated(new Date());
          setSecondsAgo(0);
        } else if (result.wrongPin) {
          onLocked();
        }
      });

    void load();
    const pollId = setInterval(load, 5000);
    return () => {
      current = false;
      clearInterval(pollId);
    };
  }, [pin, onLocked]);

  useEffect(() => {
    if (!lastUpdated) return;
    const tickId = setInterval(
      () => setSecondsAgo(Math.round((Date.now() - lastUpdated.getTime()) / 1000)),
      1000,
    );
    return () => clearInterval(tickId);
  }, [lastUpdated]);

  const updatedLabel = lastUpdated
    ? secondsAgo === 0 ? 'Just updated' : `Updated ${secondsAgo}s ago`
    : 'Loading…';

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col p-4 sm:p-6 md:p-10">
      {/* Mobile header: logo + LIVE on top row, title below */}
      <header className="mb-6 md:mb-10">
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-3">
            <img src="/gdsc-logo.svg" alt="Google Developer Student Clubs" className="h-7" />
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34A853] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#34A853]" />
              </span>
              <span className="text-xs font-bold text-[#34A853]">LIVE</span>
              <span className="text-[10px] text-[#9AA0A6]">{updatedLabel}</span>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-[#202124]">Live Leaderboard</h1>
            <p className="text-xs text-[#5F6368] mt-1">Who&apos;s got the highest score?</p>
          </div>
        </div>

        {/* Desktop header: original 3-col layout */}
        <div className="hidden md:flex items-center justify-between">
          <img src="/gdsc-logo.svg" alt="Google Developer Student Clubs" className="h-10" />
          <div className="text-center">
            <h1 className="text-5xl font-extrabold text-[#202124]">Live Leaderboard</h1>
            <p className="text-base text-[#5F6368] mt-1">Who&apos;s got the highest score?</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34A853] opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#34A853]" />
              </span>
              <span className="text-base font-bold text-[#34A853]">LIVE</span>
            </div>
            <p className="text-xs text-[#9AA0A6] mt-1 min-w-[90px]">{updatedLabel}</p>
          </div>
        </div>
      </header>

      <div className="flex-1">
        <LeaderboardTable entries={entries} />
      </div>

      <p className="text-center text-xs text-[#9AA0A6] mt-8 md:mt-10">
        Ties go to whoever reached their total first · Scores reset automatically after 48 hours
      </p>
    </div>
  );
}
