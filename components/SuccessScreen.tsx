'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GAMES } from '@/lib/games';
import { startSession } from '@/lib/clientSession';
import type { Tab } from '@/lib/types';

// Pure CSS confetti. Positions are fixed so server and client render the same markup.
const CONFETTI_COLORS = ['#4285F4', '#EA4335', '#FBBC04', '#34A853'];
const CONFETTI = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 8) * 0.15,
  duration: 2.4 + (i % 5) * 0.3,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

interface Props {
  name: string;
  total: number; // This run's score.
  rank: number;
  game: Tab;
  best: number; // The player's best score on the leaderboard.
  improved: boolean; // Whether this run became the player's best.
}

export default function SuccessScreen({ name, total, rank, game, best, improved }: Props) {
  const router = useRouter();
  const meta = GAMES[game];
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  async function handlePlayAgain() {
    if (starting) return;
    setStarting(true);
    setError('');
    const result = await startSession(name);
    if (result.ok) {
      router.push('/play');
      return; // Stay disabled until the play page replaces this screen.
    }
    setError(result.error);
    setStarting(false);
  }

  return (
    <div className="relative overflow-hidden flex flex-col items-center text-center py-8 space-y-4">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {CONFETTI.map((piece, i) => (
          <span
            key={i}
            className="anim-confetti absolute top-0 block w-2 h-3 rounded-sm"
            style={{
              left: `${piece.left}%`,
              background: piece.color,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
            }}
          />
        ))}
      </div>
      <div className="relative text-5xl">🏆</div>
      <h2 className="relative text-2xl font-extrabold text-[#202124]">Well done, {name}!</h2>
      <p className="relative text-sm font-semibold text-[#5F6368]">
        <span aria-hidden="true">{meta.emoji}</span> {meta.title}
      </p>
      <p className="relative text-4xl font-black text-[#1A73E8]">
        <span>{total}</span>{' '}
        <span className="text-xl font-semibold text-[#5F6368]">/ 1000 pts</span>
      </p>
      {improved ? (
        <p className="relative text-sm font-bold text-[#B06000]">🎉 New personal best!</p>
      ) : (
        <p className="relative text-sm text-[#5F6368]">Your best is {best} / 1000</p>
      )}
      <p className="relative text-sm font-bold text-[#34A853]">You&apos;re #{rank} on the leaderboard</p>

      <div className="relative flex flex-col items-center gap-2 pt-2 w-full">
        <button
          type="button"
          onClick={handlePlayAgain}
          disabled={starting}
          className="min-h-14 w-full max-w-xs px-8 py-4 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-60 disabled:cursor-not-allowed text-white text-lg font-extrabold shadow transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40"
        >
          {starting ? 'Starting…' : (
            <>
              Play again <span aria-hidden="true">🔁</span>
            </>
          )}
        </button>
        <p className="text-xs text-[#5F6368]">Each run gets new questions. Your best score counts.</p>
        {error && <p role="alert" className="text-xs text-[#EA4335]">{error}</p>}
      </div>

      <a
        href="https://forms.gle/N5UBuhErH9wqjpV87"
        target="_blank"
        rel="noopener noreferrer"
        className="relative mt-2 bg-[#34A853] hover:bg-[#2C8E45] text-white font-bold px-8 py-3 rounded-full text-sm transition-all shadow"
      >
        Join GDSC →
      </a>
      <a href="/leaderboard" className="relative text-xs text-[#1A73E8] underline">View Live Leaderboard</a>
      <div className="relative flex items-center gap-3 pt-2">
        <a
          href="https://www.instagram.com/gdsc.bau.tripoli/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-semibold text-[#5F6368] hover:text-[#E1306C] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
          </svg>
          @gdsc.bau.tripoli
        </a>
      </div>
    </div>
  );
}
