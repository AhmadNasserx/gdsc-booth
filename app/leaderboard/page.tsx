'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BrandMark from '@/components/BrandMark';
import Mosaic from '@/components/Mosaic';
import LeaderboardTable from '@/components/LeaderboardTable';
import RoundBoard, { formatCountdown } from '@/components/RoundBoard';
import type { LeaderboardResponse } from '@/lib/apiTypes';

function LiveDot({ size }: { size: 'sm' | 'lg' }) {
  const dot = size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5';
  return (
    <span className={`relative flex ${dot}`}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coral opacity-75" />
      <span className={`relative inline-flex rounded-full ${dot} bg-coral`} />
    </span>
  );
}

/** What the countdown card shows. `nowMs` is server time, estimated from the client clock. */
function countdownFor(data: LeaderboardResponse | null, nowMs: number): { label: string | null; value: string } {
  if (!data) return { label: null, value: 'Loading…' };
  const { event } = data;
  if (event.startedAt === null || event.currentRound === null || event.roundEndsAt === null) {
    return { label: null, value: 'Prize clock starts with the first player' };
  }
  return {
    label: `Hour ${event.currentRound} prize in`,
    value: formatCountdown(event.roundEndsAt - nowMs),
  };
}

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  // Server clock minus client clock, so a phone or TV with a wrong clock still counts correctly.
  const [offsetMs, setOffsetMs] = useState(0);
  // Client time, refreshed every second. Used for the countdown and the "Updated" label.
  const [clock, setClock] = useState(0);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  // The hour end (ms) we last refetched at, so the refetch fires once per hour boundary.
  const refetchedFor = useRef<number | null>(null);

  const load = useCallback(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((body: LeaderboardResponse) => {
        if (!body || !body.event || !Array.isArray(body.entries) || !Array.isArray(body.rounds)) return;
        const now = Date.now();
        setData(body);
        setOffsetMs(body.event.now - now);
        setClock(now);
        setReceivedAt(now);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const pollId = setInterval(load, 5000);
    return () => clearInterval(pollId);
  }, [load]);

  useEffect(() => {
    const tickId = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tickId);
  }, []);

  // When the countdown reaches zero, fetch once so the next hour appears.
  useEffect(() => {
    const endsAt = data?.event.roundEndsAt ?? null;
    if (endsAt === null) return;
    if (endsAt - (clock + offsetMs) > 0 || refetchedFor.current === endsAt) return;
    refetchedFor.current = endsAt;
    load();
  }, [data, clock, offsetMs, load]);

  const countdown = countdownFor(data, clock + offsetMs);

  const secondsAgo = receivedAt === null ? 0 : Math.max(0, Math.round((clock - receivedAt) / 1000));
  const updatedLabel = receivedAt === null
    ? 'Loading…'
    : secondsAgo === 0 ? 'Just updated' : `Updated ${secondsAgo}s ago`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-mist flex flex-col px-4 py-6 md:px-10 md:py-10">
      <Mosaic className="mosaic-fade pointer-events-none absolute right-0 top-0 h-40 w-3/4 md:h-64 md:w-1/2" cols={28} rows={8} />
      <header className="relative mb-6 md:mb-8">
        {/* Mobile header: brand and LIVE on the top row, title below */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-3 mb-4">
            <BrandMark size="sm" chip />
            <div className="flex items-center gap-1.5 shrink-0">
              <LiveDot size="sm" />
              <span className="text-xs font-bold text-coral">LIVE</span>
              <span className="text-[10px] text-muted-2">{updatedLabel}</span>
            </div>
          </div>
          <div className="text-center">
            <h1 className="font-display text-4xl font-bold text-indigo">Live Leaderboard</h1>
            <p className="text-xs text-muted mt-1">Who&apos;s got the highest score?</p>
          </div>
        </div>

        {/* Desktop header: brand on the left, title centred, LIVE on the right */}
        <div className="hidden md:flex items-center justify-between gap-6">
          <BrandMark chip />
          <div className="text-center">
            <h1 className="font-display text-6xl font-bold text-indigo">Live Leaderboard</h1>
            <p className="text-base text-muted mt-1">Who&apos;s got the highest score?</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <LiveDot size="lg" />
              <span className="text-base font-bold text-coral">LIVE</span>
            </div>
            <p className="text-xs text-muted-2 mt-1 min-w-[90px]">{updatedLabel}</p>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-3xl bg-indigo shadow-[0_24px_60px_-28px_rgba(43,27,87,0.7)] px-5 py-6 md:px-10 md:py-8 mb-6 md:mb-8 text-center">
        <Mosaic className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/3 opacity-40" cols={10} rows={8} families={['#F7B500', '#00A6BA']} />
        {countdown.label && (
          <p className="font-display relative text-sm md:text-2xl font-semibold uppercase tracking-widest text-sci">
            {countdown.label}
          </p>
        )}
        <p
          className={`font-display relative mt-2 font-bold tabular-nums leading-none text-sci ${
            countdown.label
              ? 'text-7xl sm:text-8xl md:text-[9rem]'
              : 'text-2xl sm:text-3xl md:text-5xl text-white'
          }`}
        >
          {countdown.value}
        </p>
        <p className="relative mt-4 text-sm md:text-lg font-semibold text-white/85">
          Top 3 each hour win a prize. Finish all three games to qualify.
        </p>
      </section>

      {data && (
        <div className="relative flex flex-col gap-6 md:grid md:grid-cols-3 md:items-start md:gap-8">
          <div className="min-w-0 md:col-span-1 md:order-2">
            <RoundBoard rounds={data.rounds} currentRound={data.event.currentRound} />
          </div>

          <div className="min-w-0 md:col-span-2 md:order-1">
            <LeaderboardTable entries={data.entries} />
            <p className="mt-8 md:mt-10 text-center text-xs md:text-sm text-muted-2 leading-relaxed">
              Top 3 each hour win a prize · Ties go to whoever reached their total first · Scores reset automatically after 48 hours
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
