'use client';

import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '@/lib/firebase';
import LeaderboardTable from '@/components/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/types';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const leaderboardRef = ref(db, 'leaderboard');
    const unsub = onValue(leaderboardRef, (snap) => {
      const data = snap.val() as Record<string, LeaderboardEntry> | null;
      setEntries(data ? Object.values(data) : []);
    });
    return unsub;
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-2xl text-center mb-8">
        <div className="flex items-center justify-center space-x-0.5 mb-3">
          {[['G','#4285F4'],['o','#EA4335'],['o','#FBBC04'],['g','#4285F4'],['l','#34A853'],['e','#EA4335']].map(([c,col],i) => (
            <span key={i} className="text-3xl font-bold" style={{ color: col as string }}>{c}</span>
          ))}
        </div>
        <h1 className="text-3xl font-extrabold">Live Leaderboard</h1>
        <p className="text-sm text-[#5F6368] mt-1">Updates in real-time as players submit scores</p>
      </header>

      <div className="w-full max-w-2xl bg-white border border-[#DADCE0] rounded-3xl p-6 md:p-8 shadow-sm">
        <LeaderboardTable entries={entries} />
      </div>

      <p className="mt-6 text-xs text-[#5F6368]">Scores reset automatically after 24 hours</p>
    </div>
  );
}
