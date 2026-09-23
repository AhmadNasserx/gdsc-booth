'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const NAME_PATTERN = /^[A-Za-z0-9À-ɏ ]{2,30}$/;

type NameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

export default function NameEntry() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) { setNameStatus('idle'); return; }
    if (!NAME_PATTERN.test(trimmed)) { setNameStatus('invalid'); return; }

    setNameStatus('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/names/check?name=${encodeURIComponent(trimmed)}`);
        const { available } = await res.json();
        setNameStatus(available ? 'available' : 'taken');
      } catch {
        setNameStatus('idle');
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [name]);

  async function handleStart() {
    if (nameStatus !== 'available' || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        if (res.status === 409) setNameStatus('taken');
        return;
      }
      const { token, questions } = data;
      sessionStorage.setItem('playerToken', token);
      sessionStorage.setItem('playerName', name.trim());
      sessionStorage.setItem('playerQuestions', JSON.stringify(questions));
      router.push('/play');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const statusIcon: Record<NameStatus, React.ReactNode> = {
    idle: null,
    invalid: null,
    checking: <span className="text-[#5F6368] text-base leading-none">…</span>,
    available: <span className="text-[#34A853] text-lg font-bold leading-none">✓</span>,
    taken: <span className="text-[#EA4335] text-lg font-bold leading-none">✗</span>,
  };

  const statusMsg: Record<NameStatus, string> = {
    idle: '',
    invalid: 'Use letters, numbers, and spaces only (2–30 characters).',
    checking: '',
    available: 'This name is available!',
    taken: 'This name is already taken — choose another.',
  };

  const msgColor: Record<NameStatus, string> = {
    idle: '',
    invalid: 'text-[#EA4335]',
    checking: 'text-[#5F6368]',
    available: 'text-[#34A853]',
    taken: 'text-[#EA4335]',
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#DADCE0] rounded-3xl p-8 shadow-sm">
        <div className="text-center mb-8">
          <img src="/gdsc-logo.svg" alt="Google Developer Student Clubs" className="w-72 mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold mt-2">Interactive Tech Station</h1>
          <p className="text-sm text-[#5F6368] mt-1">Test your skills and join GDSC!</p>
        </div>

        <label className="block text-sm font-semibold mb-1 text-[#202124]">
          Choose a display name
        </label>
        <div className="relative mb-1.5">
          <input
            type="text"
            placeholder="Your display name…"
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          Your name and score appear on the public leaderboard and are deleted after 24 hours.
        </p>

        {error && (
          <p role="alert" className="text-xs text-[#EA4335] mb-3">{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={nameStatus !== 'available' || loading}
          className="w-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-full transition-all"
        >
          {loading ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  );
}
