'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearSessionNotice,
  getPlayerKey,
  getSavedName,
  getSavedPhone,
  peekSessionNotice,
  savePhone,
  startSession,
  useIsBrowser,
} from '@/lib/clientSession';
import { COUNTRIES, DEFAULT_COUNTRY, countryLabel, findCountry } from '@/lib/countries';
import { combinePhone, normalizePhone, startsWithCountryCode } from '@/lib/phone';
import BrandMark from '@/components/BrandMark';

const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;

// 'mine': the name is held by this browser's player key, so the player can reuse it.
type CheckedStatus = 'idle' | 'available' | 'mine' | 'taken';
type NameStatus = 'idle' | 'invalid' | 'checking' | CheckedStatus;
// 'prefixed': a + or 00 was typed into the national field, which already has the country code picked.
// 'taken': the server refused this number as registered to another player.
type PhoneStatus = 'idle' | 'invalid' | 'prefixed' | 'taken' | 'valid';

export default function NameEntry() {
  const router = useRouter();
  const isBrowser = useIsBrowser();
  // Until the player types, the field shows the name used last time (empty on the server).
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? (isBrowser ? getSavedName() ?? '' : '');
  // Result of the last availability check, tagged with the name it was for.
  const [check, setCheck] = useState<{ name: string; status: CheckedStatus } | null>(null);
  // The phone is a country code picked from the list (Lebanon by default) and the number typed after it.
  // Like the name, both are prefilled from the last visit. Consent is never prefilled.
  const savedPhone = isBrowser ? getSavedPhone() : null;
  const [typedCountry, setTypedCountry] = useState<string | null>(null);
  const countryCode = typedCountry ?? savedPhone?.country ?? DEFAULT_COUNTRY;
  const [typedNational, setTypedNational] = useState<string | null>(null);
  const national = typedNational ?? savedPhone?.national ?? '';
  const [consent, setConsent] = useState(false);
  // Key of the phone number the server refused as registered; it applies only while the field still holds it.
  const [takenPhone, setTakenPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Pause state from GET /api/status. Null until it loads (or if it fails), which keeps Start disabled.
  const [pauseState, setPauseState] = useState<{ paused: boolean; message?: string } | null>(null);
  const paused = pauseState?.paused === true;
  const statusKnown = pauseState !== null;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/status', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPauseState({
          paused: data.paused === true,
          message: typeof data.message === 'string' ? data.message : undefined,
        });
      })
      .catch(() => {
        // Leave the state null on any error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedName = name.trim();
  // A result only applies to the name it was checked for; a stale one shows as "checking".
  const nameStatus: NameStatus = !trimmedName
    ? 'idle'
    : !NAME_PATTERN.test(trimmedName)
      ? 'invalid'
      : check?.name === trimmedName
        ? check.status
        : 'checking';

  // The full number the server receives, for example "+96170123456". Empty when no digits were typed.
  const internationalPhone = combinePhone(findCountry(countryCode)?.dial ?? '', national);
  const phoneCheck = normalizePhone(internationalPhone);
  const phoneStatus: PhoneStatus = !national.trim()
    ? 'idle'
    : startsWithCountryCode(national)
      ? 'prefixed'
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
    statusKnown && !paused &&
    (nameStatus === 'available' || nameStatus === 'mine') &&
    phoneStatus === 'valid' &&
    consent;

  async function handleStart() {
    if (!canStart || loading) return;
    setLoading(true);
    setError('');
    const result = await startSession(trimmedName, internationalPhone, consent);
    if (result.ok) {
      savePhone({ country: countryCode, national: national.trim() });
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
    prefixed: 'Leave out the + or 00. Choose your country code in the list instead.',
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
          <BrandMark className="text-lg font-bold mb-3" />
          <h1 className="text-2xl font-extrabold mt-2">Tech and Science Challenge</h1>
          <p className="text-sm text-[#5F6368] mt-1">Beirut Arab University, Tripoli campus</p>
          <p className="text-sm font-semibold text-[#202124] mt-3">
            Play three quick games, once each, in order. Your scores add up.
          </p>
          <p className="text-sm font-semibold text-[#202124] mt-2">
            The top 3 players win a prize every hour. Finish all three games to qualify.
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
        <div className="flex gap-2 mb-1.5">
          <select
            id="country-code"
            aria-label="Country code"
            value={countryCode}
            onChange={(e) => setTypedCountry(e.target.value)}
            className="w-44 shrink-0 p-3.5 border border-[#DADCE0] rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm"
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {countryLabel(country)}
              </option>
            ))}
          </select>
          <input
            id="phone-number"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="70 123 456"
            required
            aria-describedby="phone-help"
            aria-invalid={phoneStatus === 'invalid' || phoneStatus === 'prefixed' || phoneStatus === 'taken'}
            value={national}
            onChange={(e) => setTypedNational(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            className="min-w-0 flex-1 p-3.5 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm"
          />
        </div>
        <p id="phone-help" className="text-xs text-[#5F6368] mb-1.5">
          Only used to contact the winner. Never shown on the leaderboard.
        </p>
        {phoneMsg[phoneStatus] && (
          <p className="text-xs mb-2 text-[#EA4335]">{phoneMsg[phoneStatus]}</p>
        )}
        {phoneStatus === 'valid' && phoneCheck.ok && (
          <p className="text-xs mb-2 text-[#5F6368]">Sent as {phoneCheck.phone}</p>
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

        {paused && (
          <p role="status" className="text-sm font-semibold text-[#B06000] bg-[#FEF7E0] border border-[#FBBC04] rounded-xl p-3 mb-3 text-center">
            {pauseState?.message ?? 'The game is paused right now. The leaderboard is still live.'}
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
