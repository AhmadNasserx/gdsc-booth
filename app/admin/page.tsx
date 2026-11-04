'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuditPanel from '@/app/admin/_components/AuditPanel';
import ClockPanel from '@/app/admin/_components/ClockPanel';
import GamePanel from '@/app/admin/_components/GamePanel';
import PlayersPanel from '@/app/admin/_components/PlayersPanel';
import WinnersPanel from '@/app/admin/_components/WinnersPanel';
import {
  BUTTON_SECONDARY,
  ERROR_TEXT,
  SUBTLE_TEXT,
  callApi,
  isUnauthorized,
  type AdminPlayer,
  type OverviewResponse,
  type PlayersResponse,
  type WinnersResponse,
} from '@/app/admin/_components/shared';

const POLL_MS = 5000;

export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [winners, setWinners] = useState<WinnersResponse | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null);
  // Server clock minus client clock, measured when the overview arrives.
  const [offsetMs, setOffsetMs] = useState(0);
  // Client time, refreshed every second to drive the countdown.
  const [clock, setClock] = useState(0);
  // True when the last refresh had a failed read. The panels keep their last data.
  const [readFailed, setReadFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const goToLogin = useCallback(() => {
    router.replace('/admin/login');
  }, [router]);

  const load = useCallback(async () => {
    const [overviewResult, winnersResult, playersResult] = await Promise.all([
      callApi<OverviewResponse>('/api/admin/overview'),
      callApi<WinnersResponse>('/api/admin/winners'),
      callApi<PlayersResponse>('/api/admin/players'),
    ]);
    if (
      isUnauthorized(overviewResult) ||
      isUnauthorized(winnersResult) ||
      isUnauthorized(playersResult)
    ) {
      router.replace('/admin/login');
      return;
    }

    const now = Date.now();
    setClock(now);
    if (overviewResult.ok) {
      setOverview(overviewResult.data);
      setOffsetMs(overviewResult.data.event.now - now);
    }
    if (winnersResult.ok) setWinners(winnersResult.data);
    if (playersResult.ok) setPlayers(playersResult.data.players);
    setReadFailed(!(overviewResult.ok && winnersResult.ok && playersResult.ok));
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const me = await callApi('/api/admin/me');
      if (cancelled) return;
      if (!me.ok) {
        router.replace('/admin/login');
        return;
      }
      await load();
      if (cancelled) return;
      timer = setInterval(() => {
        void load();
      }, POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [load, router]);

  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    const result = await callApi('/api/admin/logout', { method: 'POST' });
    if (result.ok || isUnauthorized(result)) {
      router.replace('/admin/login');
      return;
    }
    setSigningOut(false);
    setSignOutError(result.error);
  }

  const serverNow = clock + offsetMs;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6 pb-12">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Open Doors admin</h1>
        <button type="button" onClick={signOut} disabled={signingOut} className={BUTTON_SECONDARY}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </header>

      {signOutError && (
        <p role="alert" className={ERROR_TEXT}>
          {signOutError}
        </p>
      )}
      {readFailed && (
        <p role="status" className="rounded-2xl border border-sci bg-sci-soft p-3 text-sm font-semibold text-sci-ink">
          Could not refresh everything. The panels show the last update.
        </p>
      )}

      {overview === null && winners === null && players === null ? (
        <p role="status" className={SUBTLE_TEXT}>
          Loading...
        </p>
      ) : (
        <>
          {overview && (
            <ClockPanel
              event={overview.event}
              serverNow={serverNow}
              onChanged={load}
              onUnauthorized={goToLogin}
            />
          )}
          {overview && (
            <GamePanel paused={overview.paused} onChanged={load} onUnauthorized={goToLogin} />
          )}
          {winners && (
            <WinnersPanel rounds={winners.rounds} onChanged={load} onUnauthorized={goToLogin} />
          )}
          {players && (
            <PlayersPanel players={players} onChanged={load} onUnauthorized={goToLogin} />
          )}
          {overview && <AuditPanel entries={overview.audit} />}
        </>
      )}
    </main>
  );
}
