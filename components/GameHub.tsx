'use client';

import type { MeResponse } from '@/lib/apiTypes';
import { GAMES } from '@/lib/games';
import { TABS, type Tab } from '@/lib/types';

// Short "how it scores" line per game. Describes what counts, never a maximum.
const HOW_IT_SCORES: Record<Tab, string> = {
  riddles: 'Every correct answer scores. Faster finishes score more.',
  trivia: 'Right answers add, wrong ones cost you. Faster finishes score more.',
  password: 'Longer, more varied and less predictable passwords score higher.',
  wordle: 'Fewer guesses score more. Faster finishes score more.',
  memory: 'Fewer moves score more. Faster finishes score more.',
  bugs: 'Every bug you catch scores. Faster finishes score more.',
};

interface Props {
  name: string;
  /** null while the player's scores are loading. */
  me: MeResponse | null;
  /** Shown when the scores could not be loaded; the game cards still work. */
  error?: string;
  /** One-off message, for example after a run was ended elsewhere. */
  notice?: string;
  onPick: (game: Tab) => void;
  onRetry?: () => void;
}

function bestOf(me: MeResponse | null, game: Tab): number | null {
  const best = me?.bests[game];
  return typeof best === 'number' ? best : null;
}

export default function GameHub({ name, me, error, notice, onPick, onRetry }: Props) {
  const played = me ? TABS.filter((tab) => bestOf(me, tab) !== null).length : 0;

  return (
    <div className="w-full max-w-4xl">
      <header className="text-center mb-6 md:mb-8">
        <p className="text-sm font-semibold text-[#1A73E8]">Hey {name} 👋</p>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#202124] mt-1">Play all six games</h1>

        <div className="mt-4 inline-flex flex-col sm:flex-row items-center gap-x-4 gap-y-1 bg-white border border-[#DADCE0] rounded-2xl px-5 py-3 shadow-sm">
          {me ? (
            <>
              <p className="text-sm font-bold text-[#202124]">
                {`Your total: ${me.total} pts · ${played} of ${TABS.length} games played`}
              </p>
              <p className="text-sm font-bold text-[#137333]">
                {me.rank !== null ? `You're #${me.rank}` : 'Play a game to get on the board'}
              </p>
            </>
          ) : (
            <p className="text-sm text-[#5F6368]">{error ? 'Your scores are unavailable right now.' : 'Loading your scores…'}</p>
          )}
        </div>

        {error && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <p role="alert" className="text-xs text-[#EA4335]">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="min-h-11 px-4 text-xs font-bold text-[#1A73E8] underline"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {notice && (
          <p role="status" className="mt-3 text-xs text-[#B06000] bg-[#FEF7E0] border border-[#FBBC04] rounded-xl px-4 py-2 inline-block">
            {notice}
          </p>
        )}
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TABS.map((tab, i) => {
          const game = GAMES[tab];
          const best = bestOf(me, tab);
          const status = !me ? 'Loading…' : best === null ? 'Not played yet' : `Your best: ${best} pts`;
          return (
            <li key={tab} className="flex">
              <button
                type="button"
                onClick={() => onPick(tab)}
                style={{ animationDelay: `${i * 80}ms` }}
                className="anim-stagger group w-full text-left flex flex-col bg-white border border-[#DADCE0] rounded-3xl p-5 md:p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-[#1A73E8] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
              >
                <span className="block text-4xl md:text-5xl mb-3" aria-hidden="true">{game.emoji}</span>
                <span className="block text-lg md:text-xl font-extrabold text-[#202124]">{game.title}</span>
                <span className="block text-sm text-[#5F6368] mt-1">{game.tagline}</span>
                <span className="block text-xs text-[#5F6368] mt-3">{HOW_IT_SCORES[tab]}</span>
                <span
                  className={`block text-sm font-bold mt-3 ${best === null ? 'text-[#B06000]' : 'text-[#137333]'}`}
                >
                  {status}
                </span>
                <span className="mt-auto pt-4">
                  <span className="inline-flex items-center gap-1 bg-[#1A73E8] group-hover:bg-[#1557B0] text-white text-sm font-bold px-4 py-2 rounded-full transition-colors">
                    {best === null ? 'Play' : 'Play again'} →
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
        <a href="/leaderboard" className="min-h-11 inline-flex items-center px-4 text-sm font-semibold text-[#1A73E8] underline">
          View live leaderboard
        </a>
        <a
          href="https://forms.gle/N5UBuhErH9wqjpV87"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 inline-flex items-center bg-[#34A853] hover:bg-[#2C8E45] text-white font-bold px-6 py-2 rounded-full text-sm transition-all shadow"
        >
          Join GDSC →
        </a>
      </div>
    </div>
  );
}
