'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NameEntry() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Failed to start session');
      const { token } = await res.json();
      sessionStorage.setItem('playerToken', token);
      sessionStorage.setItem('playerName', name.trim());
      router.push('/play');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#DADCE0] rounded-3xl p-8 shadow-sm">
        {/* GDSC Header */}
        <div className="text-center mb-8">
          <img src="/gdsc-logo.svg" alt="Google Developer Student Clubs" className="w-72 mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold mt-2">Interactive Tech Station</h1>
          <p className="text-sm text-[#5F6368] mt-1">Test your skills and join GDSC!</p>
        </div>

        <label className="block text-sm font-semibold mb-1 text-[#202124]">
          Choose a display name
        </label>
        <input
          type="text"
          placeholder="Your display name..."
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleStart()}
          className="w-full p-3.5 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm mb-3"
        />

        <p className="text-xs text-[#5F6368] mb-4 bg-[#F8F9FA] rounded-xl p-3 border border-[#DADCE0]">
          Your display name and score will appear on today&apos;s public leaderboard and will be deleted automatically after 24 hours.
        </p>

        {error && (
          <p role="alert" className="text-xs text-[#EA4335] mb-3">{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={!name.trim() || loading}
          className="w-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-full transition-all"
        >
          {loading ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  );
}
