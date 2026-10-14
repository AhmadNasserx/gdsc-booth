'use client';

import { GAME_LIST } from '@/lib/games';
import type { Tab } from '@/lib/types';

interface Props {
  name: string;
  onPick: (game: Tab) => void;
}

export default function GamePicker({ name, onPick }: Props) {
  return (
    <div className="w-full max-w-4xl">
      <header className="text-center mb-6 md:mb-8">
        <p className="text-sm font-semibold text-[#1A73E8]">Hey {name} 👋</p>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#202124] mt-1">Pick your challenge</h1>
        <p className="text-sm md:text-base text-[#5F6368] mt-2 max-w-xl mx-auto">
          Your pick is the score that goes on the leaderboard. You can still try the other games for fun!
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GAME_LIST.map((game, i) => (
          <li key={game.id} className="flex">
            <button
              type="button"
              onClick={() => onPick(game.id)}
              style={{ animationDelay: `${i * 80}ms` }}
              className="anim-stagger group w-full text-left flex flex-col bg-white border border-[#DADCE0] rounded-3xl p-5 md:p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-[#1A73E8] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
            >
              <span className="block text-4xl md:text-5xl mb-3" aria-hidden="true">{game.emoji}</span>
              <span className="block text-lg md:text-xl font-extrabold text-[#202124]">{game.title}</span>
              <span className="block text-sm text-[#5F6368] mt-1">{game.tagline}</span>
              <span className="block text-xs text-[#9AA0A6] mt-3">{game.howItScores}</span>
              <span className="mt-auto pt-4">
                <span className="inline-flex items-center gap-1 bg-[#1A73E8] group-hover:bg-[#1557B0] text-white text-sm font-bold px-4 py-2 rounded-full transition-colors">
                  Play →
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
