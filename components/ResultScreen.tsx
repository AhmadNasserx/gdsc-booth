'use client';

import type { RunResult } from '@/lib/apiTypes';
import { GAMES } from '@/lib/games';
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
  /** The game that was just finished. */
  game: Tab;
  result: RunResult;
  /** The next game in order, or null when this was the last one. */
  nextGame: Tab | null;
  onNextGame: () => void;
}

const buttonBase =
  'min-h-12 w-full max-w-xs px-6 py-3.5 rounded-full text-base font-extrabold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40 disabled:opacity-60';

export default function ResultScreen({ game, result, nextGame, onNextGame }: Props) {
  const meta = GAMES[game];

  return (
    <div className="relative overflow-hidden flex flex-col items-center text-center py-6 space-y-4">
      {result.improved && (
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
      )}

      <div className="relative text-5xl" aria-hidden="true">{result.improved ? '🏆' : '✅'}</div>
      <h2 className="relative text-2xl font-extrabold text-[#202124]">Game done!</h2>
      <p className="relative text-sm font-semibold text-[#5F6368]">
        <span aria-hidden="true">{meta.emoji}</span> {meta.title}
      </p>

      <p className="relative text-4xl font-black text-[#1A73E8]">{`+${result.score} pts`}</p>

      <p className="relative text-sm font-bold text-[#137333]">
        {`Your total: ${result.total} pts · You're #${result.rank}`}
      </p>

      <div className="relative flex flex-col items-center gap-3 pt-3 w-full">
        <button
          type="button"
          onClick={onNextGame}
          className={`${buttonBase} bg-[#1A73E8] hover:bg-[#1557B0] text-white shadow`}
        >
          {nextGame ? `Next: ${GAMES[nextGame].title} →` : 'See my results →'}
        </button>

        <a
          href="/leaderboard"
          className="min-h-11 inline-flex items-center px-4 text-sm font-semibold text-[#1A73E8] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] rounded"
        >
          View leaderboard
        </a>
      </div>
    </div>
  );
}
