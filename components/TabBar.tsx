'use client';

import { GAME_LIST } from '@/lib/games';
import type { Tab } from '@/lib/types';

const SHORT_LABEL: Record<Tab, string> = {
  riddles:  'Riddles',
  trivia:   'Trivia',
  password: 'Password',
  wordle:   'Wordle',
  memory:   'Memory',
  bugs:     'Bugs',
};

interface Props {
  activeTab: Tab;
  /** The game the player picked; only this one is scored. */
  chosenTab: Tab | null;
  /** Tabs that show a ✓ (the scored game once it is completed). */
  completedTabs: Set<Tab>;
  onTabChange: (tab: Tab) => void;
}

export default function TabBar({ activeTab, chosenTab, completedTabs, onTabChange }: Props) {
  return (
    <nav
      aria-label="Games"
      className="w-full mb-4 bg-[#E8EAED] p-1.5 rounded-full overflow-x-auto snap-x snap-mandatory"
    >
      {/* Mobile: one row that scrolls sideways. sm+: the tabs share the full width. */}
      <div className="flex gap-1 w-max sm:w-full">
        {GAME_LIST.map((game) => {
          const tab = game.id;
          const isActive = activeTab === tab;
          const isChosen = chosenTab === tab;
          const done = completedTabs.has(tab);
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-pressed={isActive}
              aria-label={isChosen ? `${game.title} (your scored game)` : undefined}
              className={`relative snap-start shrink-0 sm:flex-1 min-h-11 px-3.5 py-2.5 whitespace-nowrap rounded-full text-xs font-semibold transition-colors duration-200 ${
                isActive
                  ? 'bg-white text-[#1A73E8] shadow-sm'
                  : done
                  ? 'text-[#137333] hover:text-[#0D5C2A]'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <span aria-hidden="true">{game.emoji}</span> {SHORT_LABEL[tab]}
              {isChosen && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -left-0.5 w-5 h-5 bg-[#FBBC04] rounded-full text-[10px] leading-none flex items-center justify-center"
                >
                  ⭐
                </span>
              )}
              {done && (
                <span className="absolute -top-1 -right-0.5 w-4 h-4 bg-[#34A853] text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none anim-pop">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
