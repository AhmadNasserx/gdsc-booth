'use client';

import type { Tab } from '@/lib/types';

const TAB_LABELS: Record<Tab, string> = {
  riddles: '🧩 Emoji',
  trivia: '⚡ Trivia',
  binary: '🔢 Binary',
  password: '🔐 Password',
};

interface Props {
  activeTab: Tab;
  completedTabs: Set<Tab>;
  onTabChange: (tab: Tab) => void;
}

export default function TabBar({ activeTab, completedTabs, onTabChange }: Props) {
  return (
    <nav className="w-full bg-[#E2E7EB] p-1.5 rounded-full flex justify-between space-x-1 mb-6 shadow-inner">
      {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
        const isActive = activeTab === tab;
        const done = completedTabs.has(tab);
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 py-2.5 px-2 text-xs md:text-sm font-semibold rounded-full transition-all duration-200 ${
              isActive
                ? 'bg-white text-[#1A73E8] shadow-md'
                : 'text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            {TAB_LABELS[tab]} {done ? '✓' : ''}
          </button>
        );
      })}
    </nav>
  );
}
