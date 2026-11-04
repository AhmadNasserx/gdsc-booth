'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BUTTON_PRIMARY, ERROR_TEXT, INPUT, callApi, type ApiResult } from '@/app/admin/_components/shared';

const FALLBACK_ERROR = 'Sign-in failed. Try again.';

/** The server's message, plus how long to wait when the sign-in is rate limited. */
function errorText(result: Extract<ApiResult<unknown>, { ok: false }>): string {
  if (result.status !== 429 || result.retryAfter === null) return result.error;
  const minutes = Math.max(1, Math.ceil(result.retryAfter / 60));
  return `${result.error} Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const result = await callApi('/api/admin/login', { method: 'POST', body: { password } }, FALLBACK_ERROR);
    if (result.ok) {
      router.replace('/admin');
      return; // Stay busy until the dashboard replaces this page.
    }
    setError(errorText(result));
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm rounded-3xl border border-[#DADCE0] bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-extrabold text-[#202124]">Admin sign in</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="admin-password" className="mb-1.5 block text-sm font-semibold text-[#202124]">
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </div>

          {error && (
            <p role="alert" className={ERROR_TEXT}>
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={`${BUTTON_PRIMARY} w-full min-h-[52px] text-lg`}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
