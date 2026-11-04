'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearSessionNotice,
  getPlayerKey,
  getSavedName,
  getSavedPhone,
  getSavedProfile,
  peekSessionNotice,
  savePhone,
  saveProfile,
  startSession,
  useIsBrowser,
} from '@/lib/clientSession';
import { COUNTRIES, DEFAULT_COUNTRY, countryLabel, findCountry } from '@/lib/countries';
import { combinePhone, normalizePhone, startsWithCountryCode } from '@/lib/phone';
import { GAME_TEXT, saveLang, usePickedLang, useT, type Lang } from '@/lib/i18n';
import { GRADES, GRADE_LABELS, SCHOOL_MAX, TRACKS, TRACK_LABELS, type Grade } from '@/lib/profile';
import { SCHOOLS } from '@/lib/schools';
import { GAME_LIST } from '@/lib/games';
import BrandMark from '@/components/BrandMark';
import Mosaic from '@/components/Mosaic';

const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;
// Value of the dropdown entry for a school that is not in the list.
const OTHER_SCHOOL = '__other__';

// 'mine': the name is held by this browser's player key, so the player can reuse it.
type CheckedStatus = 'idle' | 'available' | 'mine' | 'taken';
type NameStatus = 'idle' | 'invalid' | 'checking' | CheckedStatus;
// 'prefixed': a + or 00 was typed into the national field, which already has the country code picked.
// 'taken': the server refused this number as registered to another player.
type PhoneStatus = 'idle' | 'invalid' | 'prefixed' | 'taken' | 'valid';

const LANG_CHOICES: { lang: Lang; label: string; short: string }[] = [
  { lang: 'en', label: 'English', short: 'EN' },
  { lang: 'fr', label: 'Français', short: 'FR' },
];

const FIELD_BASE =
  'p-3.5 border border-line rounded-2xl bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-sci focus:border-sci';
const FIELD = `w-full ${FIELD_BASE}`;
const LABEL = 'block text-sm font-bold mb-1.5 text-ink';

function chip(selected: boolean): string {
  return `min-h-11 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sci/40 ${
    selected ? 'border-sci bg-sci text-ink shadow-sm' : 'border-line bg-white text-muted hover:border-sci hover:text-ink'
  }`;
}

export default function NameEntry() {
  const router = useRouter();
  const isBrowser = useIsBrowser();
  const pickedLang = usePickedLang();
  const { lang, t } = useT();
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
  // School and class, prefilled from the last visit too.
  const savedProfile = isBrowser ? getSavedProfile() : null;
  const savedSchoolChoice = savedProfile
    ? savedProfile.other || !SCHOOLS.includes(savedProfile.school) ? OTHER_SCHOOL : savedProfile.school
    : '';
  const [typedSchoolChoice, setSchoolChoice] = useState<string | null>(null);
  const schoolChoice = typedSchoolChoice ?? savedSchoolChoice;
  const [typedOtherSchool, setOtherSchool] = useState<string | null>(null);
  const otherSchool = typedOtherSchool ?? (savedSchoolChoice === OTHER_SCHOOL ? savedProfile?.school ?? '' : '');
  const [typedGrade, setGrade] = useState<Grade | null>(null);
  const savedGrade = GRADES.find((g) => g === savedProfile?.grade) ?? null;
  const grade = typedGrade ?? savedGrade;
  const [typedTrack, setTrack] = useState<string | null>(null);
  const savedTrack = savedGrade && TRACKS[savedGrade].includes(savedProfile?.track ?? '') ? savedProfile?.track ?? null : null;
  const track = typedTrack ?? (typedGrade === null || typedGrade === savedGrade ? savedTrack : null);
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

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

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

  const school = (schoolChoice === OTHER_SCHOOL ? otherSchool : schoolChoice).replace(/\s+/g, ' ').trim();
  const schoolOk = school.length >= 2 && school.length <= SCHOOL_MAX;
  const tracks = grade ? TRACKS[grade] : [];
  const levelOk = grade !== null && (tracks.length === 0 || (track !== null && tracks.includes(track)));

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
    pickedLang !== null &&
    (nameStatus === 'available' || nameStatus === 'mine') &&
    schoolOk && levelOk &&
    phoneStatus === 'valid' &&
    consent;

  async function handleStart() {
    if (!canStart || loading || grade === null || pickedLang === null) return;
    setLoading(true);
    setError('');
    const profile = { school, grade, track: tracks.length ? track : null, lang: pickedLang };
    const result = await startSession(trimmedName, internationalPhone, consent, profile);
    if (result.ok) {
      savePhone({ country: countryCode, national: national.trim() });
      saveProfile({ school, other: schoolChoice === OTHER_SCHOOL, grade, track: track ?? '' });
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
    checking: <span className="text-muted text-base leading-none">…</span>,
    available: <span className="text-[#34A853] text-lg font-bold leading-none">✓</span>,
    mine: <span className="text-[#34A853] text-lg font-bold leading-none">✓</span>,
    taken: <span className="text-[#EA4335] text-lg font-bold leading-none">✗</span>,
  };

  const statusMsg: Record<NameStatus, string> = {
    idle: '',
    invalid: t('home.nameInvalid'),
    checking: '',
    available: t('home.nameAvailable'),
    mine: t('home.nameMine', { name: trimmedName }),
    taken: t('home.nameTaken'),
  };

  const phoneMsg: Record<PhoneStatus, string> = {
    idle: '',
    invalid: t('home.phoneInvalid'),
    prefixed: t('home.phonePrefixed'),
    taken: t('home.phoneTaken'),
    valid: '',
  };

  const msgColor: Record<NameStatus, string> = {
    idle: '',
    invalid: 'text-[#EA4335]',
    checking: 'text-muted',
    available: 'text-[#137333]',
    mine: 'text-[#137333]',
    taken: 'text-[#EA4335]',
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <Mosaic className="mosaic-fade pointer-events-none absolute right-0 top-0 h-40 w-[78%] md:h-72 md:w-[60%]" cols={24} rows={9} />

      <div className="relative mx-auto flex w-full max-w-lg flex-col px-5 pb-12 pt-5 md:pt-10">
        <header className="mb-6">
          <BrandMark size="sm" faculty={null} chip />
          <p className="font-display mt-7 inline-flex items-center gap-2 rounded-md bg-sci px-2.5 py-1 text-sm font-semibold tracking-wider text-ink">
            {t('home.faculty')}
          </p>
          <h1 className="font-display mt-3 text-[2.6rem] font-bold leading-[0.95] text-indigo md:text-6xl">
            {t('home.title')}
            <span className="text-teal">.</span>
          </h1>
          <p className="mt-2 text-sm font-semibold text-muted">{t('home.place')}</p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {GAME_LIST.map((game, i) => (
              <div key={game.id} className="rounded-2xl border border-line bg-white/90 p-3 shadow-sm backdrop-blur">
                <p className="font-display text-xs font-semibold tracking-wider text-sci-ink">{`0${i + 1}`}</p>
                <p className="mt-1 text-2xl leading-none font-emoji" aria-hidden="true">{game.emoji}</p>
                <p className="mt-1.5 text-xs font-bold leading-tight text-ink">
                  {lang === 'fr' ? GAME_TEXT.fr[game.id].title : game.title}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-sm font-semibold text-ink">{t('home.intro1')}</p>
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-sci-soft p-3 text-sm font-bold text-ink">
            <span aria-hidden="true" className="font-emoji text-lg leading-none">🏆</span>
            <span>{t('home.intro2')}</span>
          </p>
        </header>

        <div className="rounded-3xl border border-line bg-white p-5 shadow-[0_20px_50px_-24px_rgba(43,27,87,0.35)] md:p-7">
          <fieldset className="mb-5">
            <legend className={LABEL}>{t('home.lang')}</legend>
            <div role="radiogroup" aria-label={t('home.lang')} className="grid grid-cols-2 gap-2">
              {LANG_CHOICES.map((choice) => {
                const on = pickedLang === choice.lang;
                return (
                  <button
                    key={choice.lang}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => saveLang(choice.lang)}
                    className={`${chip(on)} flex items-center justify-center gap-2 py-3 text-base`}
                  >
                    <span className={`font-display rounded px-1.5 text-xs ${on ? 'bg-ink text-sci' : 'bg-mist-2 text-muted'}`}>
                      {choice.short}
                    </span>
                    {choice.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">{t('home.langHelp')}</p>
          </fieldset>

          <label htmlFor="display-name" className={LABEL}>
            {t('home.name')}
          </label>
          <div className="relative mb-1.5">
            <input
              id="display-name"
              type="text"
              placeholder={t('home.namePlaceholder')}
              maxLength={30}
              value={name}
              onChange={(e) => setTypedName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              className={`${FIELD} pr-11`}
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

          <label htmlFor="school" className={`${LABEL} mt-4`}>
            {t('home.school')}
          </label>
          <select
            id="school"
            value={schoolChoice}
            onChange={(e) => setSchoolChoice(e.target.value)}
            className={`${FIELD} mb-2 ${schoolChoice ? '' : 'text-muted'}`}
          >
            <option value="" disabled>
              {t('home.schoolPick')}
            </option>
            {SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={OTHER_SCHOOL}>{t('home.schoolOther')}</option>
          </select>
          {schoolChoice === OTHER_SCHOOL && (
            <div className="mb-2">
              <label htmlFor="school-other" className="sr-only">
                {t('home.schoolOtherLabel')}
              </label>
              <input
                id="school-other"
                type="text"
                maxLength={SCHOOL_MAX}
                placeholder={t('home.schoolOtherPlaceholder')}
                value={otherSchool}
                onChange={(e) => setOtherSchool(e.target.value)}
                className={FIELD}
              />
            </div>
          )}

          <fieldset className="mt-4">
            <legend className={LABEL}>{t('home.grade')}</legend>
            <div role="radiogroup" aria-label={t('home.grade')} className="grid grid-cols-3 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={grade === g}
                  onClick={() => {
                    setGrade(g);
                    setTrack(null);
                  }}
                  className={chip(grade === g)}
                >
                  {GRADE_LABELS[lang][g]}
                </button>
              ))}
            </div>
          </fieldset>

          {grade && tracks.length > 0 && (
            <fieldset className="mt-3 anim-slide-in">
              <legend className={LABEL}>{t('home.track')}</legend>
              <div
                role="radiogroup"
                aria-label={t('home.track')}
                className={`grid gap-2 ${tracks.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
              >
                {tracks.map((tr) => (
                  <button
                    key={tr}
                    type="button"
                    role="radio"
                    aria-checked={track === tr}
                    onClick={() => setTrack(tr)}
                    className={chip(track === tr)}
                  >
                    {TRACK_LABELS[lang][tr]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <label htmlFor="phone-number" className={`${LABEL} mt-4`}>
            {t('home.phone')}
          </label>
          <div className="flex gap-2 mb-1.5">
            <select
              id="country-code"
              aria-label={t('home.countryCode')}
              value={countryCode}
              onChange={(e) => setTypedCountry(e.target.value)}
              className={`${FIELD_BASE} w-36 shrink-0`}
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
              className={`${FIELD_BASE} min-w-0 flex-1`}
            />
          </div>
          <p id="phone-help" className="text-xs text-muted mb-1.5">
            {t('home.phoneHelp')}
          </p>
          {phoneMsg[phoneStatus] && (
            <p className="text-xs mb-2 text-[#EA4335]">{phoneMsg[phoneStatus]}</p>
          )}
          {phoneStatus === 'valid' && phoneCheck.ok && (
            <p className="text-xs mb-2 text-muted">{t('home.phoneSent', { phone: phoneCheck.phone })}</p>
          )}

          <label className="mt-3 flex items-start gap-3 text-xs text-ink mb-4 cursor-pointer">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-sci-deep"
            />
            <span>{t('home.consent')}</span>
          </label>

          <p className="text-xs text-muted mb-4 bg-mist rounded-xl p-3 border border-line">{t('home.rules')}</p>

          {paused && (
            <p role="status" className="text-sm font-semibold text-sci-ink bg-sci-soft border border-sci rounded-xl p-3 mb-3 text-center">
              {pauseState?.message ?? t('home.paused')}
            </p>
          )}

          {isBrowser && <SessionNotice />}

          {error && (
            <p role="alert" className="text-xs text-[#EA4335] mb-3">{error}</p>
          )}

          <button
            onClick={handleStart}
            disabled={!canStart || loading}
            className="font-display w-full rounded-2xl bg-sci py-4 text-xl font-bold tracking-wider text-ink shadow-[0_6px_0_#DE9F00] transition-all hover:bg-sci-deep active:translate-y-1 active:shadow-[0_2px_0_#DE9F00] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? t('home.starting') : t('home.start')}
          </button>
        </div>

        <a
          href="/leaderboard"
          className="mx-auto mt-6 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-indigo underline decoration-sci decoration-2 underline-offset-4"
        >
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-coral" />
          </span>
          {t('home.leaderboard')}
        </a>
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
    <p role="status" className="text-xs text-sci-ink bg-sci-soft border border-sci rounded-xl p-3 mb-3">
      {message}
    </p>
  );
}
