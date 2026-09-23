'use client';

import type { Tab } from '@/lib/types';

const TAB_LABELS: Record<Tab, string> = {
  riddles:  '🧩 Emoji',
  trivia:   '⚡ Trivia',
  binary:   '🔢 Binary',
  password: '🔐 Pass',
  wordle:   '🟩 Wordle',
};

interface Props {
  activeTab: Tab;
  completedTabs: Set<Tab>;
  onTabChange: (tab: Tab) => void;
}

export default function TabBar({ activeTab, completedTabs, onTabChange }: Props) {
  return (
    <nav className="w-full bg-[#E8EAED] p-1.5 rounded-full flex justify-between gap-1 mb-6">
      {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
        const isActive = activeTab === tab;
        const done = completedTabs.has(tab);
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`relative flex-1 py-2.5 px-1 text-xs font-semibold rounded-full transition-all duration-200 ${
              isActive
                ? 'bg-white text-[#1A73E8] shadow-sm'
                : done
                ? 'text-[#34A853] hover:text-[#2C8E45]'
                : 'text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            {TAB_LABELS[tab]}
            {done && (
              <span className="absolute -top-1 -right-0.5 w-4 h-4 bg-[#34A853] text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none anim-pop">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
