'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FinishScreen from '@/components/FinishScreen';
import ResultScreen from '@/components/ResultScreen';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import TechTrivia from '@/components/games/TechTrivia';
import MemoryMatch from '@/components/games/MemoryMatch';
import EmojiWarm from '@/components/EmojiWarm';
import GameSkeleton from '@/components/GameSkeleton';
import SoundToggle from '@/components/SoundToggle';
import type { ActionBody, BatchResponse, CheckBody, CheckResponse, FlipResponse, GameView, MeResponse, RunResult, StartResponse } from '@/lib/apiTypes';
import { clearSession, getSession, setSessionNotice, useIsBrowser, type PlayerSession } from '@/lib/clientSession';
import { GameApiError, fetchMe, sendAction, startGame } from '@/lib/gameClient';
import { GAMES } from '@/lib/games';
import { GAME_TEXT, text, getSavedLang, useT } from '@/lib/i18n';
import BrandMark from '@/components/BrandMark';
import Mosaic from '@/components/Mosaic';
import { MEMORY_EMOJIS } from '@/lib/memoryEmojis';
import { TABS, type Tab } from '@/lib/types';

// Messages are read in the player's language at the moment they are shown.
const SESSION_EXPIRED = () => text(getSavedLang() ?? 'en', 'play.expired');
const RUN_ENDED = () => text(getSavedLang() ?? 'en', 'play.runEnded');
const FALLBACK_ERROR = () => text(getSavedLang() ?? 'en', 'common.error');

// The page is always in exactly one stage. A running game carries the functions that
// talk to its run, so the render itself never reads a ref.
type PlayingStage = {
  kind: 'playing';
  game: Tab;
  start: StartResponse;
  act: <R>(body: ActionBody) => Promise<R>;
  check: (body: CheckBody) => Promise<CheckResponse>;
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
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR();
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
  // Until then the page shows the same skeleton the server sends, so the first paint is never blank.
  const isBrowser = useIsBrowser();
  const { t } = useT();
  if (!isBrowser) {
    return (
      <Shell notice="" warm>
        <Card>
          <GameSkeleton game={null} label={t('play.ready')} />
        </Card>
      </Shell>
    );
  }
  return <PlayFlow />;
}

function PlayFlow() {
  const router = useRouter();
  const { lang, t } = useT();
  const title = (tab: Tab) => (lang === 'fr' ? GAME_TEXT.fr[tab].title : GAMES[tab].title);
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
    setSessionNotice(SESSION_EXPIRED());
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
      resumeRef.current(RUN_ENDED());
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
        // A refused check does not resume the game the way a refused action does. The run is still
        // fine, and the batch at the end decides the result. An expired session still has to leave.
        const check = (body: CheckBody): Promise<CheckResponse> =>
          sendAction<CheckResponse>(token, runId, body).catch((error: unknown) => {
            if (isSessionExpired(error)) expireSession();
            throw error;
          });
        const onDone = (result: RunResult) => finishRun(runId, game, result);
        setStage({ kind: 'playing', game, start: started, act, check, onDone });
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

  // MemoryMatch warms its own faces, so the page skips them only while that board is on screen.
  const warm = !(stage.kind === 'playing' && stage.game === 'memory');

  return (
    <Shell notice={notice} warm={warm}>
      {stage.kind === 'boot' && (
        <Card>
          <GameSkeleton game={null} label={t('play.ready')} />
        </Card>
      )}

      {stage.kind === 'loading' && (
        <Card>
          <GameSkeleton game={stage.game} label={t('play.starting', { game: title(stage.game) })} />
        </Card>
      )}

      {stage.kind === 'start-failed' && (
        <Card>
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <p className="text-4xl font-emoji" aria-hidden="true">📡</p>
            <h2 className="text-lg font-extrabold text-ink">{t('play.startFailed')}</h2>
            <p role="alert" className="text-sm text-muted max-w-sm">
              {stage.message}
            </p>
            <p className="text-xs text-muted">{t('play.safe')}</p>
            <button
              type="button"
              onClick={() => resume()}
              className="min-h-12 w-full max-w-xs px-6 py-3 rounded-full bg-sci hover:bg-sci-deep text-ink font-bold shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sci/40"
            >
              {t('play.tryAgain')}
            </button>
          </div>
        </Card>
      )}

      {stage.kind === 'playing' && (
        <Card>
          <GameStepper game={stage.game} label={t('play.gameOf', { n: TABS.indexOf(stage.game) + 1, total: TABS.length })} title={title(stage.game)} />
          <div key={stage.start.runId}>{renderGame(stage.start.view, stage.act, stage.check, stage.onDone)}</div>
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
    </Shell>
  );
}

/**
 * The page frame, shared by the server render and the browser render so the first paint matches.
 * The sound toggle sits in a top bar on every stage. The emoji strip is fixed and transparent,
 * so it takes no room in the layout.
 */
function Shell({ notice, warm, children }: { notice: string; warm: boolean; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-mist flex flex-col items-center p-4 md:p-8">
      <Mosaic className="mosaic-fade pointer-events-none absolute right-0 top-0 h-32 w-3/4 md:h-48 md:w-1/2" cols={24} rows={8} />
      <div className="relative mb-4 flex w-full max-w-2xl items-center justify-between gap-3">
        <BrandMark size="sm" faculty={null} chip />
        <SoundToggle />
      </div>

      {notice && (
        <p role="status" className="relative mb-4 text-xs text-sci-ink bg-sci-soft border border-sci rounded-xl px-4 py-2">
          {notice}
        </p>
      )}

      {children}
      {warm && <EmojiWarm glyphs={MEMORY_EMOJIS} />}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative w-full max-w-2xl bg-white border border-line rounded-3xl p-6 md:p-8 shadow-[0_20px_50px_-28px_rgba(43,27,87,0.4)]">
      {children}
    </main>
  );
}

/** "Game 2 of 3" with a three-step bar, so the player sees how far along the visit is. */
function GameStepper({ game, label, title }: { game: Tab; label: string; title: string }) {
  const at = TABS.indexOf(game);
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-sm font-semibold tracking-wider text-sci-ink">{label}</p>
        <p className="font-display text-sm font-semibold tracking-wider text-indigo">{title}</p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" aria-hidden="true">
        {TABS.map((tab, i) => (
          <span key={tab} className={`h-1.5 rounded-full ${i < at ? 'bg-indigo' : i === at ? 'bg-sci' : 'bg-line'}`} />
        ))}
      </div>
    </div>
  );
}

function renderGame(
  view: GameView,
  act: <R>(body: ActionBody) => Promise<R>,
  check: (body: CheckBody) => Promise<CheckResponse>,
  onDone: (result: RunResult) => void,
) {
  switch (view.game) {
    case 'riddles':
      return (
        <EmojiRiddles
          questions={view.questions}
          act={(body) => act<BatchResponse>(body)}
          check={check}
          onDone={onDone}
        />
      );
    case 'memory':
      return <MemoryMatch cards={view.cards} act={(body) => act<FlipResponse>(body)} onDone={onDone} />;
    case 'trivia':
      return (
        <TechTrivia
          questions={view.questions}
          act={(body) => act<BatchResponse>(body)}
          check={check}
          onDone={onDone}
        />
      );
  }
}
