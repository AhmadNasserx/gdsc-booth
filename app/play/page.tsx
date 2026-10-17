'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FinishScreen from '@/components/FinishScreen';
import ResultScreen from '@/components/ResultScreen';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import TechTrivia from '@/components/games/TechTrivia';
import MemoryMatch from '@/components/games/MemoryMatch';
import type { ActionBody, BatchResponse, FlipResponse, GameView, MeResponse, RunResult, StartResponse } from '@/lib/apiTypes';
import { clearSession, getSession, setSessionNotice, useIsBrowser, type PlayerSession } from '@/lib/clientSession';
import { GameApiError, fetchMe, sendAction, startGame } from '@/lib/gameClient';
import { GAMES } from '@/lib/games';
import { TABS, type Tab } from '@/lib/types';

const SESSION_EXPIRED = 'Your session has ended. Enter your name to keep playing.';
const RUN_ENDED = 'That game had already finished, so we moved you on.';
const FALLBACK_ERROR = 'Something went wrong. Please try again.';

// The page is always in exactly one stage. A running game carries the functions that
// talk to its run, so the render itself never reads a ref.
type PlayingStage = {
  kind: 'playing';
  game: Tab;
  start: StartResponse;
  act: <R>(body: ActionBody) => Promise<R>;
  onDone: (result: RunResult) => void;
};

type Stage =
  | { kind: 'boot' }
  | { kind: 'loading'; game: Tab }
  | { kind: 'start-failed'; message: string }
  | PlayingStage
  | { kind: 'result'; game: Tab; result: RunResult }
  | { kind: 'finished'; total: number; rank: number | null };

function isSessionExpired(error: unknown): boolean {
  return error instanceof GameApiError && error.status === 401;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

/** The first game in play order that has no score yet, or null when all are played. */
function nextUnplayed(played: readonly Tab[]): Tab | null {
  return TABS.find((tab) => !played.includes(tab)) ?? null;
}

function playedOf(me: MeResponse): Tab[] {
  return TABS.filter((tab) => typeof me.bests[tab] === 'number');
}

export default function PlayPage() {
  // Storage is read only in the browser, so the server and the first client render match.
  const isBrowser = useIsBrowser();
  if (!isBrowser) return null;
  return <PlayFlow />;
}

function PlayFlow() {
  const router = useRouter();
  const [session, setSession] = useState<PlayerSession | null>(() => getSession());
  const [stage, setStage] = useState<Stage>({ kind: 'boot' });
  const [notice, setNotice] = useState('');
  // The run the player can still act on. Cleared on the first completion, so late
  // duplicate responses (a double tap) cannot move the player off the result screen.
  const liveRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) router.push('/');
  }, [session, router]);

  const expireSession = useCallback(() => {
    liveRunRef.current = null;
    clearSession();
    setSessionNotice(SESSION_EXPIRED);
    setSession(null);
  }, []);

  const finishRun = useCallback((runId: string, game: Tab, result: RunResult) => {
    // Only the first completion of a run counts.
    if (liveRunRef.current !== runId) return;
    liveRunRef.current = null;
    setStage({ kind: 'result', game, result });
  }, []);

  // Set below, once `resume` exists. Lets an action error move the player on without the
  // callbacks depending on each other in a circle.
  const resumeRef = useRef<(message?: string) => void>(() => {});

  // Errors from an action: an expired session leaves; a run that has ended elsewhere
  // (404/409) moves the player on; anything else stays on the game screen
  // so the game can offer a retry.
  const onActionError = useCallback(
    (runId: string, error: unknown) => {
      if (isSessionExpired(error)) {
        expireSession();
        return;
      }
      if (!(error instanceof GameApiError) || (error.status !== 404 && error.status !== 409)) return;
      if (liveRunRef.current !== runId) return; // the run already finished, so this is a late duplicate
      resumeRef.current(RUN_ENDED);
    },
    [expireSession],
  );

  const start = useCallback(
    async (game: Tab) => {
      if (!session) return;
      const { token } = session;
      setStage({ kind: 'loading', game });
      try {
        const started = await startGame(token, game);
        const runId = started.runId;
        liveRunRef.current = runId;
        const act = <R,>(body: ActionBody): Promise<R> =>
          sendAction<R>(token, runId, body).catch((error: unknown) => {
            onActionError(runId, error);
            throw error;
          });
        const onDone = (result: RunResult) => finishRun(runId, game, result);
        setStage({ kind: 'playing', game, start: started, act, onDone });
      } catch (error) {
        if (isSessionExpired(error)) {
          expireSession();
          return;
        }
        setStage({ kind: 'start-failed', message: messageOf(error) });
      }
    },
    [session, expireSession, onActionError, finishRun],
  );

  // Works out where the player is from the server's record: into the next game they have not
  // played, or to the finish screen when all are played.
  const route = useCallback(() => {
    if (!session) return;
    fetchMe(session.token).then(
      (me) => {
        const next = nextUnplayed(playedOf(me));
        if (next) void start(next);
        else setStage({ kind: 'finished', total: me.total, rank: me.rank });
      },
      (error: unknown) => {
        if (isSessionExpired(error)) expireSession();
        else setStage({ kind: 'start-failed', message: messageOf(error) });
      },
    );
  }, [session, start, expireSession]);

  const resume = useCallback(
    (message = '') => {
      liveRunRef.current = null;
      setNotice(message);
      setStage({ kind: 'boot' });
      route();
    },
    [route],
  );

  useEffect(() => {
    resumeRef.current = resume;
  }, [resume]);

  // The page opens in the 'boot' stage, so arriving only needs to look up where the player is.
  useEffect(() => {
    route();
    // Only on arrival: later moves are driven by the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center p-4 md:p-8">
      {notice && (
        <p role="status" className="mb-4 text-xs text-[#B06000] bg-[#FEF7E0] border border-[#FBBC04] rounded-xl px-4 py-2">
          {notice}
        </p>
      )}

      {stage.kind === 'boot' && (
        <Card>
          <p role="status" className="py-10 text-center text-sm font-semibold text-[#5F6368]">
            Getting your game ready…
          </p>
        </Card>
      )}

      {stage.kind === 'loading' && (
        <Card>
          <p role="status" className="py-10 text-center text-sm font-semibold text-[#5F6368]">
            <span aria-hidden="true">{GAMES[stage.game].emoji}</span> Starting {GAMES[stage.game].title}…
          </p>
        </Card>
      )}

      {stage.kind === 'start-failed' && (
        <Card>
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <p className="text-4xl" aria-hidden="true">📡</p>
            <h2 className="text-lg font-extrabold text-[#202124]">Couldn&apos;t start the next game</h2>
            <p role="alert" className="text-sm text-[#5F6368] max-w-sm">
              {stage.message}
            </p>
            <p className="text-xs text-[#5F6368]">Your scores so far are safe.</p>
            <button
              type="button"
              onClick={() => resume()}
              className="min-h-12 w-full max-w-xs px-6 py-3 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40"
            >
              Try again
            </button>
          </div>
        </Card>
      )}

      {stage.kind === 'playing' && (
        <Card>
          <p className="text-xs font-bold text-[#5F6368] mb-4">
            {`Game ${TABS.indexOf(stage.game) + 1} of ${TABS.length}`}
          </p>
          <div key={stage.start.runId}>{renderGame(stage.start.view, stage.act, stage.onDone)}</div>
        </Card>
      )}

      {stage.kind === 'result' && (
        <Card>
          <ResultScreen
            game={stage.game}
            result={stage.result}
            nextGame={nextUnplayed(stage.result.gamesPlayed)}
            onNextGame={() => {
              const next = nextUnplayed(stage.result.gamesPlayed);
              if (next) void start(next);
              else setStage({ kind: 'finished', total: stage.result.total, rank: stage.result.rank });
            }}
          />
        </Card>
      )}

      {stage.kind === 'finished' && (
        <Card>
          <FinishScreen name={session.name} total={stage.total} rank={stage.rank} />
        </Card>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="w-full max-w-2xl bg-white border border-[#DADCE0] rounded-3xl p-6 md:p-8 shadow-sm">
      {children}
    </main>
  );
}

function renderGame(
  view: GameView,
  act: <R>(body: ActionBody) => Promise<R>,
  onDone: (result: RunResult) => void,
) {
  switch (view.game) {
    case 'riddles':
      return <EmojiRiddles questions={view.questions} act={(body) => act<BatchResponse>(body)} onDone={onDone} />;
    case 'memory':
      return <MemoryMatch cards={view.cards} act={(body) => act<FlipResponse>(body)} onDone={onDone} />;
    case 'trivia':
      return <TechTrivia questions={view.questions} act={(body) => act<BatchResponse>(body)} onDone={onDone} />;
  }
}
