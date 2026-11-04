'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BrandMark from '@/components/BrandMark';
import LeaderboardTable from '@/components/LeaderboardTable';
import RoundBoard, { formatCountdown } from '@/components/RoundBoard';
import type { LeaderboardResponse } from '@/lib/apiTypes';

function LiveDot({ size }: { size: 'sm' | 'lg' }) {
  const dot = size === 'lg' ? 'h-3 w-3' : 'h-2.5 w-2.5';
  return (
    <span className={`relative flex ${dot}`}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34A853] opacity-75" />
      <span className={`relative inline-flex rounded-full ${dot} bg-[#34A853]`} />
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
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col px-4 py-6 md:px-10 md:py-10">
      <header className="mb-6 md:mb-8">
        {/* Mobile header: brand and LIVE on the top row, title below */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-3 mb-4">
            <BrandMark />
            <div className="flex items-center gap-1.5 shrink-0">
              <LiveDot size="sm" />
              <span className="text-xs font-bold text-[#34A853]">LIVE</span>
              <span className="text-[10px] text-[#9AA0A6]">{updatedLabel}</span>
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-[#202124]">Live Leaderboard</h1>
            <p className="text-xs text-[#5F6368] mt-1">Who&apos;s got the highest score?</p>
          </div>
        </div>

        {/* Desktop header: brand on the left, title centred, LIVE on the right */}
        <div className="hidden md:flex items-center justify-between gap-6">
          <BrandMark />
          <div className="text-center">
            <h1 className="text-5xl font-extrabold text-[#202124]">Live Leaderboard</h1>
            <p className="text-base text-[#5F6368] mt-1">Who&apos;s got the highest score?</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <LiveDot size="lg" />
              <span className="text-base font-bold text-[#34A853]">LIVE</span>
            </div>
            <p className="text-xs text-[#9AA0A6] mt-1 min-w-[90px]">{updatedLabel}</p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-[#E8EAED] bg-white shadow-sm px-5 py-6 md:px-10 md:py-8 mb-6 md:mb-8 text-center">
        {countdown.label && (
          <p className="text-sm md:text-2xl font-bold uppercase tracking-widest text-[#5F6368]">
            {countdown.label}
          </p>
        )}
        <p
          className={`mt-2 font-black tabular-nums leading-none text-[#1A73E8] ${
            countdown.label
              ? 'text-7xl sm:text-8xl md:text-[9rem]'
              : 'text-2xl sm:text-3xl md:text-5xl text-[#202124]'
          }`}
        >
          {countdown.value}
        </p>
        <p className="mt-4 text-sm md:text-lg text-[#5F6368]">
          Top 3 each hour win a prize. Finish all three games to qualify.
        </p>
      </section>

      {data && (
        <div className="flex flex-col gap-6 md:grid md:grid-cols-3 md:items-start md:gap-8">
          <div className="min-w-0 md:col-span-1 md:order-2">
            <RoundBoard rounds={data.rounds} currentRound={data.event.currentRound} />
          </div>

          <div className="min-w-0 md:col-span-2 md:order-1">
            <LeaderboardTable entries={data.entries} />
            <p className="mt-8 md:mt-10 text-center text-xs md:text-sm text-[#9AA0A6] leading-relaxed">
              Top 3 each hour win a prize · Ties go to whoever reached their total first · Scores reset automatically after 48 hours
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
