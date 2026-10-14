'use client';

import { useEffect, useRef, useState } from 'react';
import { calcPasswordScore, passwordStrengthLabel } from '@/lib/scoring';
import type { PasswordResponse, RunResult } from '@/lib/apiTypes';

const LOCK_CELEBRATE_MS = 900;

interface Props {
  act: (body: { password: string }) => Promise<PasswordResponse>;
  onDone: (result: RunResult) => void;
}

const TIPS = [
  { label: '8+ chars', check: (p: string) => p.length >= 8 },
  { label: '24+ chars', check: (p: string) => p.length >= 24 },
  { label: 'Uppercase', check: (p: string) => /[A-Z]/.test(p) },
  { label: 'Digit', check: (p: string) => /[0-9]/.test(p) },
  { label: 'Symbol', check: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const BAR_COLOR = (score: number) =>
  score >= 172 ? '#34A853' : score >= 142 ? '#1A73E8' : score >= 102 ? '#FBBC04' : '#EA4335';

/**
 * Open-ended fill: rises quickly at first, then flattens towards 90% and never reaches it,
 * so the bar never looks maxed out. 0 -> 0%, 200 -> ~78%.
 */
const barPercent = (score: number) => 90 * (1 - Math.exp(-score / 100));

export default function PasswordChallenge({ act, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server's verdict once the password is locked in.
  const [lockedIn, setLockedIn] = useState<PasswordResponse | null>(null);

  // Synchronous guard against double submits.
  const inFlightRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const reportedRef = useRef(false);
  const aliveRef = useRef(true);

  const score = calcPasswordScore(password);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Report the result once, after the locked-in state has been shown for a moment.
  useEffect(() => {
    if (!lockedIn) return;
    const id = window.setTimeout(() => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      onDoneRef.current(lockedIn.result);
    }, LOCK_CELEBRATE_MS);
    return () => window.clearTimeout(id);
  }, [lockedIn]);

  async function lockIn() {
    if (inFlightRef.current || lockedIn || !password) return;
    inFlightRef.current = true;
    setPending(true);
    setError(null);

    try {
      const response = await act({ password });
      if (!aliveRef.current) return;
      setLockedIn(response);
      setPending(false);
    } catch (err) {
      if (!aliveRef.current) return;
      inFlightRef.current = false;
      setPending(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  const locked = lockedIn !== null;

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
          disabled={locked || pending}
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
          style={{ width: `${barPercent(score)}%`, backgroundColor: BAR_COLOR(score) }}
        />
      </div>
      <div className="w-full flex justify-between items-center mb-5">
        <span className="text-xs font-semibold text-[#5F6368]">
          {password ? passwordStrengthLabel(score) : 'Start typing…'}
        </span>
        <span className="text-xs font-bold" style={{ color: BAR_COLOR(score) || '#5F6368' }}>
          {score} pts
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
        disabled={!password || locked || pending}
        aria-busy={pending || undefined}
        className="w-full bg-[#34A853] hover:bg-[#2C8E45] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full transition-all"
      >
        {lockedIn
          ? `Locked In — ${lockedIn.score} pts ✓`
          : pending
            ? 'Locking in…'
            : 'Lock In'}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-center text-xs font-semibold text-[#C5221F]">
          {error}
        </p>
      )}
    </div>
  );
}
