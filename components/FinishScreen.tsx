'use client';

import { useEffect } from 'react';
import Burst from '@/components/Burst';
import CountUp from '@/components/CountUp';
import { feedback } from '@/lib/feedback';

const BURST_COLORS = ['#1A73E8', '#34A853', '#FBBC04', '#EA4335'];

interface Props {
  name: string;
  total: number;
  /** null if the player has no score on the board. */
  rank: number | null;
}

export default function FinishScreen({ name, total, rank }: Props) {
  // Plays once, when the last game's finish screen appears.
  useEffect(() => {
    feedback('finish');
  }, []);

  return (
    <div className="relative overflow-hidden flex flex-col items-center text-center py-6 space-y-4">
      <Burst count={24} colors={BURST_COLORS} className="pointer-events-none" />
      <div className="relative text-5xl" aria-hidden="true">🏁</div>
      <h2 className="relative text-2xl font-extrabold text-[#202124]">That&apos;s all three games, {name}!</h2>
      <p className="relative text-4xl font-black text-[#1A73E8]">
        <CountUp value={total} format={(n) => `${n} pts`} className="text-4xl font-black text-[#1A73E8]" />
      </p>
      {rank !== null && <p className="relative text-sm font-bold text-[#137333]">{`You're #${rank} on the leaderboard`}</p>}
      <p className="relative text-xs text-[#5F6368] max-w-sm">
        Each game can be played once. This game is part of the Open House at Beirut Arab University, Tripoli campus.
      </p>
      <p className="relative text-xs text-[#5F6368] max-w-sm">
        Prizes are given every hour to that hour&apos;s top 3 players. Watch the leaderboard screen and stay near the booth.
      </p>
      <div className="relative flex flex-col items-center gap-3 pt-3 w-full">
        <a
          href="/leaderboard"
          className="min-h-12 w-full max-w-xs inline-flex items-center justify-center px-6 py-3.5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-base font-extrabold shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40"
        >
          View leaderboard
        </a>
      </div>
    </div>
  );
}
