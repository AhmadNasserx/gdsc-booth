'use client';

import { useState, useRef } from 'react';
import { calcPasswordScore, passwordStrengthLabel } from '@/lib/scoring';

interface Props { onComplete: (score: number) => void; }

const TIPS = [
  { label: '8+ chars', check: (p: string) => p.length >= 8 },
  { label: '18+ chars', check: (p: string) => p.length >= 18 },
  { label: 'Uppercase', check: (p: string) => /[A-Z]/.test(p) },
  { label: 'Digit', check: (p: string) => /[0-9]/.test(p) },
  { label: 'Symbol', check: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const BAR_COLOR = (score: number) =>
  score >= 86 ? '#34A853' : score >= 71 ? '#1A73E8' : score >= 51 ? '#FBBC04' : '#EA4335';

export default function PasswordChallenge({ onComplete }: Props) {
  const [password, setPassword] = useState('');
  const [locked, setLocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const doneRef = useRef(false);
  const score = calcPasswordScore(password);

  function lockIn() {
    if (doneRef.current || !password) return;
    doneRef.current = true;
    setLocked(true);
    onComplete(score);
  }

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-1 text-center">Password Challenge 🔐</h2>
      <p className="text-xs text-[#5F6368] mb-5 text-center">
        Build the strongest password you can. Length, variety, and uniqueness all matter!
      </p>

      <div className="relative w-full mb-4">
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Type your password…"
          maxLength={128}
          value={password}
          disabled={locked}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3.5 pr-12 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5F6368] text-xs font-semibold hover:text-[#1A73E8]"
          tabIndex={-1}
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>

      {/* Strength bar */}
      <div className="w-full bg-[#DADCE0] h-3 rounded-full overflow-hidden mb-1">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${score}%`, backgroundColor: BAR_COLOR(score) }}
        />
      </div>
      <div className="w-full flex justify-between items-center mb-5">
        <span className="text-xs font-semibold text-[#5F6368]">
          {password ? passwordStrengthLabel(score) : 'Start typing…'}
        </span>
        <span className="text-xs font-bold" style={{ color: BAR_COLOR(score) || '#5F6368' }}>
          {score}/100
        </span>
      </div>

      {/* Tips */}
      <div className="w-full flex flex-wrap gap-2 mb-6">
        {TIPS.map(({ label, check }) => {
          const met = check(password);
          return (
            <span
              key={label}
              className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${
                met ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#F8F9FA] text-[#5F6368]'
              }`}
            >
              {met ? '✓' : '○'} {label}
            </span>
          );
        })}
        <span className="text-xs px-3 py-1 rounded-full font-semibold bg-[#FEF9E5] text-[#B06000]">
          ⚠ Avoid patterns (123, abc…)
        </span>
      </div>

      <button
        onClick={lockIn}
        disabled={!password || locked}
        className="w-full bg-[#34A853] hover:bg-[#2C8E45] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full transition-all"
      >
        {locked ? `Locked In — ${score} pts ✓` : 'Lock In'}
      </button>
    </div>
  );
}
