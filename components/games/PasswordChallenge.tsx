'use client';

import { useState, useRef } from 'react';
import { calcPasswordScore } from '@/lib/scoring';

interface Props { onComplete: (score: number) => void; }

const TIPS = [
  { label: '8+ chars', check: (p: string) => p.length >= 8 },
  { label: '12+ chars', check: (p: string) => p.length >= 12 },
  { label: 'Uppercase', check: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number', check: (p: string) => /[0-9]/.test(p) },
  { label: 'Symbol', check: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function PasswordChallenge({ onComplete }: Props) {
  const [password, setPassword] = useState('');
  const [locked, setLocked] = useState(false);
  const doneRef = useRef(false);
  const score = calcPasswordScore(password);

  function lockIn() {
    if (doneRef.current || !password) return;
    doneRef.current = true;
    setLocked(true);
    onComplete(score);
  }

  const barColor = score >= 75 ? '#34A853' : score >= 50 ? '#FBBC04' : '#EA4335';

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-1 text-center">Password Challenge 🔐</h2>
      <p className="text-xs text-[#5F6368] mb-6 text-center">
        Build the strongest password you can. Your score counts toward the leaderboard!
      </p>

      <input
        type="password"
        placeholder="Type your password..."
        maxLength={128}
        value={password}
        disabled={locked}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full p-3.5 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm mb-4"
      />

      <div className="w-full bg-[#DADCE0] h-3 rounded-full overflow-hidden mb-2">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{ width: `${score}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="text-right w-full text-xs font-bold text-[#5F6368] mb-4">{score}% Strength</p>

      <div className="w-full flex flex-wrap gap-2 mb-6">
        {TIPS.map(({ label, check }) => (
          <span
            key={label}
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              check(password)
                ? 'bg-[#E6F4EA] text-[#137333]'
                : 'bg-[#F8F9FA] text-[#5F6368]'
            }`}
          >
            {check(password) ? '✓' : '○'} {label}
          </span>
        ))}
      </div>

      <button
        onClick={lockIn}
        disabled={!password || locked}
        className="w-full bg-[#34A853] hover:bg-[#2C8E45] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-full transition-all"
      >
        {locked ? `Lock In — ${score} pts ✓` : 'Lock In'}
      </button>
    </div>
  );
}
