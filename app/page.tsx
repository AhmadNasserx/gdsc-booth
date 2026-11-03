'use client';

import { useEffect, useState } from 'react';
import { GAME_PAUSED, PAUSED_MESSAGE } from '@/lib/config';
import { useRouter } from 'next/navigation';
import {
  clearSessionNotice,
  getPlayerKey,
  getSavedName,
  getSavedPhone,
  peekSessionNotice,
  startSession,
  useIsBrowser,
} from '@/lib/clientSession';
import { normalizePhone } from '@/lib/phone';

const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;

// 'mine': the name is held by this browser's player key, so the player can reuse it.
type CheckedStatus = 'idle' | 'available' | 'mine' | 'taken';
type NameStatus = 'idle' | 'invalid' | 'checking' | CheckedStatus;
// 'taken': the server refused this number as registered to another player.
type PhoneStatus = 'idle' | 'invalid' | 'taken' | 'valid';

export default function NameEntry() {
  const router = useRouter();
  const isBrowser = useIsBrowser();
  // Until the player types, the field shows the name used last time (empty on the server).
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? (isBrowser ? getSavedName() ?? '' : '');
  // Result of the last availability check, tagged with the name it was for.
  const [check, setCheck] = useState<{ name: string; status: CheckedStatus } | null>(null);
  // Like the name, the phone number is prefilled from the last visit. Consent is never prefilled.
  const [typedPhone, setTypedPhone] = useState<string | null>(null);
  const phone = typedPhone ?? (isBrowser ? getSavedPhone() ?? '' : '');
  const [consent, setConsent] = useState(false);
  // Key of the phone number the server refused as registered; it applies only while the field still holds it.
  const [takenPhone, setTakenPhone] = useState<string | null>(null);
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

  const trimmedPhone = phone.trim();
  const phoneCheck = normalizePhone(trimmedPhone);
  const phoneStatus: PhoneStatus = !trimmedPhone
    ? 'idle'
    : !phoneCheck.ok
      ? 'invalid'
      : phoneCheck.key === takenPhone
        ? 'taken'
        : 'valid';

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

  const canStart =
    !GAME_PAUSED &&
    (nameStatus === 'available' || nameStatus === 'mine') &&
    phoneStatus === 'valid' &&
    consent;

  async function handleStart() {
    if (!canStart || loading) return;
    setLoading(true);
    setError('');
    const result = await startSession(trimmedName, trimmedPhone, consent);
    if (result.ok) {
      router.push('/play');
      return; // Stay in the loading state until the play page replaces this one.
    }
    if (result.field === 'phone' && result.status === 409 && phoneCheck.ok) {
      setTakenPhone(phoneCheck.key);
    } else {
      setError(result.error);
    }
    if (result.field === 'name' && result.status === 409) setCheck({ name: trimmedName, status: 'taken' });
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

  const phoneMsg: Record<PhoneStatus, string> = {
    idle: '',
    invalid: 'Enter 8 to 15 digits. Spaces, dashes and brackets are fine.',
    taken: 'This phone number is already registered.',
    valid: '',
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

        <label htmlFor="phone-number" className="block text-sm font-semibold mb-1 text-[#202124]">
          Phone number
        </label>
        <input
          id="phone-number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+961 70 123 456"
          required
          aria-describedby="phone-help"
          aria-invalid={phoneStatus === 'invalid' || phoneStatus === 'taken'}
          value={phone}
          onChange={(e) => setTypedPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          className="w-full p-3.5 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm mb-1.5"
        />
        <p id="phone-help" className="text-xs text-[#5F6368] mb-1.5">
          Only used to contact the winner. Never shown on the leaderboard.
        </p>
        {phoneMsg[phoneStatus] && (
          <p className="text-xs mb-2 text-[#EA4335]">{phoneMsg[phoneStatus]}</p>
        )}

        <label className="flex items-start gap-3 text-xs text-[#202124] mb-4 cursor-pointer">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#1A73E8]"
          />
          <span>
            I agree to be contacted on this number if I win. My number is stored privately and deleted after 48 hours.
          </span>
        </label>

        <p className="text-xs text-[#5F6368] mb-4 bg-[#F8F9FA] rounded-xl p-3 border border-[#DADCE0]">
          Letters, numbers, and spaces · 2–30 characters · no duplicates.{' '}
          Your name and score appear on the public leaderboard. Your phone number is used only to contact
          the winner and is never shown publicly. Both are deleted after 48 hours.{' '}
          Each game can be played once.
        </p>

        {GAME_PAUSED && (
          <p role="status" className="text-sm font-semibold text-[#B06000] bg-[#FEF7E0] border border-[#FBBC04] rounded-xl p-3 mb-3 text-center">
            {PAUSED_MESSAGE}
          </p>
        )}

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
