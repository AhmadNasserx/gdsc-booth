'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import GameHub from '@/components/GameHub';
import ResultScreen from '@/components/ResultScreen';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import TechTrivia from '@/components/games/TechTrivia';
import BugHunter from '@/components/games/BugHunter';
import Wordle from '@/components/games/Wordle';
import MemoryMatch from '@/components/games/MemoryMatch';
import PasswordChallenge from '@/components/games/PasswordChallenge';
import type {
  ActionBody,
  AnswerResponse,
  FinishResponse,
  FlipResponse,
  GameView,
  GuessResponse,
  MeResponse,
  PasswordResponse,
  RunResult,
  StartResponse,
} from '@/lib/apiTypes';
import { clearSession, getSession, setSessionNotice, type PlayerSession } from '@/lib/clientSession';
import { GameApiError, fetchMe, sendAction, startGame } from '@/lib/gameClient';
import { GAMES } from '@/lib/games';
import { TABS, type Tab } from '@/lib/types';

const SESSION_EXPIRED = 'Your session has ended. Enter your name to keep playing.';
const RUN_ENDED = 'That game had already finished, so we took you back to the games.';
const FALLBACK_ERROR = 'Something went wrong. Please try again.';

// The page is always in exactly one stage.
type Stage =
  | { kind: 'hub' }
  | { kind: 'loading'; game: Tab }
  | { kind: 'start-failed'; game: Tab; message: string }
  | { kind: 'playing'; game: Tab; token: string; start: StartResponse }
  | { kind: 'result'; game: Tab; result: RunResult };

function isSessionExpired(error: unknown): boolean {
  return error instanceof GameApiError && error.status === 401;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

export default function PlayPage() {
  const router = useRouter();
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'hub' });
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState('');
  const [notice, setNotice] = useState('');
  // The run the player can still act on. Cleared on the first completion, so late
  // duplicate responses (a double tap) cannot move the player off the result screen.
  const liveRunRef = useRef<string | null>(null);

  // Session is read after mount: sessionStorage does not exist on the server.
  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.push('/');
      return;
    }
    setSession(current);
  }, [router]);

  const expireSession = useCallback(() => {
    liveRunRef.current = null;
    clearSession();
    setSessionNotice(SESSION_EXPIRED);
    setSession(null);
    router.push('/');
  }, [router]);

  const loadMe = useCallback(
    async (token: string) => {
      setMeError('');
      try {
        setMe(await fetchMe(token));
      } catch (error) {
        if (isSessionExpired(error)) {
          expireSession();
          return;
        }
        setMeError(messageOf(error));
      }
    },
    [expireSession],
  );

  useEffect(() => {
    if (session) void loadMe(session.token);
  }, [session, loadMe]);

  const goHub = useCallback(
    (message = '') => {
      liveRunRef.current = null;
      setNotice(message);
      setStage({ kind: 'hub' });
      if (session) void loadMe(session.token);
    },
    [session, loadMe],
  );

  const pick = useCallback(
    async (game: Tab) => {
      if (!session) return;
      const { token } = session;
      setNotice('');
      setStage({ kind: 'loading', game });
      try {
        const start = await startGame(token, game);
        liveRunRef.current = start.runId;
        setStage({ kind: 'playing', game, token, start });
      } catch (error) {
        if (isSessionExpired(error)) {
          expireSession();
          return;
        }
        setStage({ kind: 'start-failed', game, message: messageOf(error) });
      }
    },
    [session, expireSession],
  );

  // Errors from an action: an expired session leaves; a run that has ended elsewhere
  // (404/409) sends the player back to the hub; anything else stays on the game screen
  // so the game can offer a retry.
  const onActionError = useCallback(
    (runId: string, error: unknown) => {
      if (isSessionExpired(error)) {
        expireSession();
        return;
      }
      if (!(error instanceof GameApiError) || (error.status !== 404 && error.status !== 409)) return;
      if (liveRunRef.current !== runId) return; // the run already finished, so this is a late duplicate
      goHub(RUN_ENDED);
    },
    [expireSession, goHub],
  );

  const finishRun = useCallback((game: Tab, result: RunResult) => {
    // Only the first completion of a run counts.
    if (liveRunRef.current === null) return;
    liveRunRef.current = null;
    setStage({ kind: 'result', game, result });
  }, []);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center p-4 md:p-8">
      {stage.kind === 'hub' && (
        <GameHub
          name={session.name}
          me={me}
          error={meError || undefined}
          notice={notice || undefined}
          onPick={pick}
          onRetry={() => void loadMe(session.token)}
        />
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
            <h2 className="text-lg font-extrabold text-[#202124]">Couldn&apos;t start {GAMES[stage.game].title}</h2>
            <p role="alert" className="text-sm text-[#5F6368] max-w-sm">
              {stage.message}
            </p>
            <p className="text-xs text-[#5F6368]">Your other games and scores are safe.</p>
            <div className="flex flex-col items-center gap-2 pt-2 w-full">
              <button
                type="button"
                onClick={() => void pick(stage.game)}
                className="min-h-12 w-full max-w-xs px-6 py-3 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => goHub()}
                className="min-h-11 px-4 text-sm font-semibold text-[#1A73E8] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] rounded"
              >
                Back to games
              </button>
            </div>
          </div>
        </Card>
      )}

      {stage.kind === 'playing' && (
        <Card>
          <div key={stage.start.runId}>
            {renderGame(stage.start.view, playAct(stage, onActionError), (result) => finishRun(stage.game, result))}
          </div>
        </Card>
      )}

      {stage.kind === 'result' && (
        <Card>
          <ResultScreen
            game={stage.game}
            result={stage.result}
            nextGame={TABS.find((tab) => !stage.result.gamesPlayed.includes(tab)) ?? null}
            onPlayAgain={() => void pick(stage.game)}
            onNextGame={() => {
              const next = TABS.find((tab) => !stage.result.gamesPlayed.includes(tab));
              if (next) void pick(next);
              else goHub();
            }}
            onBackToGames={() => goHub()}
          />
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

/** Sends one action for the playing run. Failures are reported to the page, then rethrown for the game. */
function playAct(stage: Extract<Stage, { kind: 'playing' }>, onActionError: (runId: string, error: unknown) => void) {
  const { token, start } = stage;
  return <R,>(body: ActionBody): Promise<R> =>
    sendAction<R>(token, start.runId, body).catch((error: unknown) => {
      onActionError(start.runId, error);
      throw error;
    });
}

function renderGame(
  view: GameView,
  act: <R>(body: ActionBody) => Promise<R>,
  onDone: (result: RunResult) => void,
) {
  switch (view.game) {
    case 'riddles':
      return (
        <EmojiRiddles
          questions={view.questions}
          act={(body) => act<AnswerResponse>(body)}
          onDone={onDone}
        />
      );
    case 'trivia':
      return (
        <TechTrivia
          questions={view.questions}
          act={(body) => act<AnswerResponse | FinishResponse>(body)}
          onDone={onDone}
        />
      );
    case 'bugs':
      return (
        <BugHunter
          questions={view.questions}
          act={(body) => act<AnswerResponse>(body)}
          onDone={onDone}
        />
      );
    case 'wordle':
      return <Wordle act={(body) => act<GuessResponse>(body)} onDone={onDone} />;
    case 'memory':
      return <MemoryMatch cards={view.cards} act={(body) => act<FlipResponse>(body)} onDone={onDone} />;
    case 'password':
      return <PasswordChallenge act={(body) => act<PasswordResponse>(body)} onDone={onDone} />;
  }
}
