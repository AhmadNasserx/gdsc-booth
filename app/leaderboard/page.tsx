'use client';

import { useEffect, useState } from 'react';
import LeaderboardTable from '@/components/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/types';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const load = () =>
      fetch('/api/leaderboard')
        .then((r) => r.json())
        .then((data: LeaderboardEntry[]) => {
          setEntries(data);
          setLastUpdated(new Date());
          setSecondsAgo(0);
        })
        .catch(() => {});

    load();
    const pollId = setInterval(load, 5000);
    return () => clearInterval(pollId);
  }, []);

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
        Scores reset automatically after 48 hours
      </p>
    </div>
  );
}
