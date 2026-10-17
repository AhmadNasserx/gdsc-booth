'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearSessionNotice,
  getPlayerKey,
  getSavedName,
  peekSessionNotice,
  startSession,
  useIsBrowser,
} from '@/lib/clientSession';

const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;

// 'mine': the name is held by this browser's player key, so the player can reuse it.
type CheckedStatus = 'idle' | 'available' | 'mine' | 'taken';
type NameStatus = 'idle' | 'invalid' | 'checking' | CheckedStatus;

export default function NameEntry() {
  const router = useRouter();
  const isBrowser = useIsBrowser();
  // Until the player types, the field shows the name used last time (empty on the server).
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? (isBrowser ? getSavedName() ?? '' : '');
  // Result of the last availability check, tagged with the name it was for.
  const [check, setCheck] = useState<{ name: string; status: CheckedStatus } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const trimmedName = name.trim();
  // A result only applies to the name it was checked for; a stale one shows as "checking".
  const nameStatus: NameStatus = !trimmedName
    ? 'idle'
    : !NAME_PATTERN.test(trimmedName)
      ? 'invalid'
      : check?.name === trimmedName
        ? check.status
        : 'checking';

  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || !NAME_PATTERN.test(trimmed)) return;

    let current = true;
    const timer = setTimeout(async () => {
      let status: CheckedStatus = 'idle';
      try {
        const playerKey = getPlayerKey();
        const res = await fetch(`/api/names/check?name=${encodeURIComponent(trimmed)}`, {
          headers: { 'x-player-key': playerKey },
        });
        const data = await res.json();
        status = data.mine ? 'mine' : data.available ? 'available' : 'taken';
      } catch {
        // Keep status 'idle' on network errors: Start stays disabled.
      }
      if (current) setCheck({ name: trimmed, status });
    }, 300);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [name]);

  const canStart = nameStatus === 'available' || nameStatus === 'mine';

  async function handleStart() {
    if (!canStart || loading) return;
    setLoading(true);
    setError('');
    const result = await startSession(trimmedName);
    if (result.ok) {
      router.push('/play');
      return; // Stay in the loading state until the play page replaces this one.
    }
    setError(result.error);
    if (result.status === 409) setCheck({ name: trimmedName, status: 'taken' });
    setLoading(false);
  }


  const statusIcon: Record<NameStatus, React.ReactNode> = {
    idle: null,
    invalid: null,
    checking: <span className="text-[#5F6368] text-base leading-none">…</span>,
    available: <span className="text-[#34A853] text-lg font-bold leading-none">✓</span>,
    mine: <span className="text-[#34A853] text-lg font-bold leading-none">✓</span>,
    taken: <span className="text-[#EA4335] text-lg font-bold leading-none">✗</span>,
  };

  const statusMsg: Record<NameStatus, string> = {
    idle: '',
    invalid: 'Use letters, numbers, and spaces only (2–30 characters).',
    checking: '',
    available: 'This name is available!',
    mine: `Welcome back, ${trimmedName}! Your best scores are kept.`,
    taken: 'This name is already taken — choose another.',
  };

  const msgColor: Record<NameStatus, string> = {
    idle: '',
    invalid: 'text-[#EA4335]',
    checking: 'text-[#5F6368]',
    available: 'text-[#34A853]',
    mine: 'text-[#34A853]',
    taken: 'text-[#EA4335]',
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#DADCE0] rounded-3xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <img src="/gdsc-logo.svg" alt="Google Developer Student Clubs" className="w-72 mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold mt-2">Interactive Tech Station</h1>
          <p className="text-sm text-[#5F6368] mt-1">Test your skills and join GDSC!</p>
          <p className="text-sm font-semibold text-[#202124] mt-3">
            Play three games, once each, in order — your scores add up. Top the leaderboard by the end of the day to win a prize.
          </p>
        </div>

        <label htmlFor="display-name" className="block text-sm font-semibold mb-1 text-[#202124]">
          Choose a display name
        </label>
        <div className="relative mb-1.5">
          <input
            id="display-name"
            type="text"
            placeholder="Your display name…"
            maxLength={30}
            value={name}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            className="w-full p-3.5 pr-11 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm"
          />
          {statusIcon[nameStatus] && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center">
              {statusIcon[nameStatus]}
            </span>
          )}
        </div>

        {statusMsg[nameStatus] && (
          <p className={`text-xs mb-2 ${msgColor[nameStatus]}`}>
            {statusMsg[nameStatus]}
          </p>
        )}

        <p className="text-xs text-[#5F6368] mb-4 bg-[#F8F9FA] rounded-xl p-3 border border-[#DADCE0]">
          Letters, numbers, and spaces · 2–30 characters · no duplicates.{' '}
          Your name and score appear on the public leaderboard and are deleted after 48 hours.{' '}
          You can play any game again any time, and only your best score in each game counts.
        </p>

        {isBrowser && <SessionNotice />}

        {error && (
          <p role="alert" className="text-xs text-[#EA4335] mb-3">{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart || loading}
          className="w-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-full transition-all"
        >
          {loading ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  );
}

// Shows the notice left by an ended session, once. It mounts only in the browser,
// so the server never renders it, and it clears the stored message as it shows.
function SessionNotice() {
  const [message] = useState(peekSessionNotice);
  useEffect(() => {
    clearSessionNotice();
  }, []);
  if (!message) return null;
  return (
    <p role="status" className="text-xs text-[#B06000] bg-[#FEF7E0] border border-[#FBBC04] rounded-xl p-3 mb-3">
      {message}
    </p>
  );
}
