'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import TabBar from '@/components/TabBar';
import GamePicker from '@/components/GamePicker';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import TechTrivia from '@/components/games/TechTrivia';
import PasswordChallenge from '@/components/games/PasswordChallenge';
import Wordle from '@/components/games/Wordle';
import MemoryMatch from '@/components/games/MemoryMatch';
import BugHunter from '@/components/games/BugHunter';
import SuccessScreen from '@/components/SuccessScreen';
import { TABS, type Tab } from '@/lib/types';
import { GAMES } from '@/lib/games';
import { onSessionStarted } from '@/lib/clientSession';
import type { Riddle, TriviaQuestion, BugQuestion } from '@/lib/questions';

interface ClientQuestions {
  riddles: Riddle[];
  trivia: TriviaQuestion[];
  bugs: BugQuestion[];
  wordleWord: string;
  wordleHint: string;
}

// The `answer` each game sends to POST /api/score.
interface AnswerMap {
  riddles: string[];
  trivia: { answer: string }[];
  password: string;
  wordle: string[];
  memory: { moves: number; seconds: number };
  bugs: number[];
}

type Answer = AnswerMap[Tab];

// Response of POST /api/score. Stored whole and passed to SuccessScreen.
interface ScoreResult {
  rank: number;
  total: number;
  game: Tab;
  best: number;
  improved: boolean;
}

const INITIAL_RUNS: Record<Tab, number> = {
  riddles: 0, trivia: 0, password: 0, wordle: 0, memory: 0, bugs: 0,
};

function isTab(value: unknown): value is Tab {
  return typeof value === 'string' && (TABS as string[]).includes(value);
}

// Sessions saved before the Bug Hunter update have no `bugs` pool.
// Those players are sent back to name entry to start a fresh session.
function isClientQuestions(value: unknown): value is ClientQuestions {
  if (!value || typeof value !== 'object') return false;
  const q = value as Record<string, unknown>;
  return (
    Array.isArray(q.riddles) &&
    Array.isArray(q.trivia) &&
    Array.isArray(q.bugs) &&
    typeof q.wordleWord === 'string' &&
    typeof q.wordleHint === 'string'
  );
}

function renderGame(tab: Tab, q: ClientQuestions, onComplete: (answer: Answer) => void) {
  switch (tab) {
    case 'riddles':
      return <EmojiRiddles questions={q.riddles} onComplete={onComplete} />;
    case 'trivia':
      return <TechTrivia questions={q.trivia} onComplete={onComplete} />;
    case 'password':
      return <PasswordChallenge onComplete={onComplete} />;
    case 'wordle':
      return <Wordle word={q.wordleWord} hint={q.wordleHint} onComplete={onComplete} />;
    case 'memory':
      return <MemoryMatch onComplete={onComplete} />;
    case 'bugs':
      return <BugHunter questions={q.bugs} onComplete={onComplete} />;
  }
}

export default function PlayPage() {
  // Bumped when "Play again" starts a new session at the same URL. Keying the play flow
  // on this remounts it with fresh state, instead of keeping the previous run's result.
  const [sessionVersion, setSessionVersion] = useState(0);
  useEffect(() => onSessionStarted(() => setSessionVersion((v) => v + 1)), []);
  return <PlaySession key={sessionVersion} />;
}

function PlaySession() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [questions, setQuestions] = useState<ClientQuestions | null>(null);
  // The one game the player picked. Only its score is submitted.
  const [game, setGame] = useState<Tab | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('riddles');
  // Answer for the picked game. Set on first completion and never changed.
  const [chosenAnswer, setChosenAnswer] = useState<Answer | null>(null);
  // Practice games that have been completed (their answers are not stored).
  const [practiceDone, setPracticeDone] = useState<Set<Tab>>(() => new Set());
  // Per-tab remount counter, used by "Play again" on practice games.
  const [runs, setRuns] = useState<Record<Tab, number>>(INITIAL_RUNS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScoreResult | null>(null);
  // Reused across retries so a repeated request returns the same result, not a second entry.
  const submissionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem('playerToken');
    const n = sessionStorage.getItem('playerName');
    const q = sessionStorage.getItem('playerQuestions');
    if (!t || !n || !q) { router.push('/'); return; }

    let parsed: unknown = null;
    try { parsed = JSON.parse(q); } catch { parsed = null; }
    if (!isClientQuestions(parsed)) { router.push('/'); return; }

    setToken(t);
    setName(n);
    setQuestions(parsed);

    const saved = sessionStorage.getItem('playerGame');
    if (isTab(saved)) {
      setGame(saved);
      setActiveTab(saved);
    } else if (saved !== null) {
      sessionStorage.removeItem('playerGame');
    }
  }, [router]);

  function handlePick(tab: Tab) {
    sessionStorage.setItem('playerGame', tab);
    setGame(tab);
    setActiveTab(tab);
  }

  function handleChangePick() {
    sessionStorage.removeItem('playerGame');
    setGame(null);
    setPracticeDone(new Set());
  }

  function completeGame(tab: Tab, answer: Answer) {
    if (tab === game) {
      // First completion wins; the scored answer is locked after that.
      setChosenAnswer((prev) => prev ?? answer);
    } else {
      setPracticeDone((prev) => new Set(prev).add(tab));
    }
  }

  function handlePlayAgain(tab: Tab) {
    setPracticeDone((prev) => {
      const next = new Set(prev);
      next.delete(tab);
      return next;
    });
    setRuns((prev) => ({ ...prev, [tab]: prev[tab] + 1 }));
  }

  async function handleSubmit() {
    if (!game || chosenAnswer === null || submitting) return;
    setSubmitting(true);
    setError('');
    if (submissionIdRef.current === null) submissionIdRef.current = crypto.randomUUID();
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          submissionId: submissionIdRef.current,
          game,
          answer: chosenAnswer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');
      setResult(data as ScoreResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!name || !questions) return null;

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white border border-[#DADCE0] rounded-3xl p-8 shadow-sm">
          <SuccessScreen name={name} {...result} />
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 md:p-8">
        <GamePicker name={name} onPick={handlePick} />
      </div>
    );
  }

  const meta = GAMES[game];
  const chosenDone = chosenAnswer !== null;
  const isChosenTab = activeTab === game;
  const practiceComplete = !isChosenTab && practiceDone.has(activeTab);

  let body: React.ReactNode;
  if (isChosenTab && chosenDone) {
    body = (
      <div className="flex flex-col items-center text-center py-10 anim-slide-in">
        <div className="w-14 h-14 rounded-full bg-[#E6F4EA] flex items-center justify-center text-2xl mb-3">✓</div>
        <p className="font-bold text-[#137333]">Game complete!</p>
        <p className="text-xs text-[#5F6368] mt-1">Your score is locked in. Submit it below.</p>
      </div>
    );
  } else if (practiceComplete) {
    body = (
      <div className="flex flex-col items-center text-center py-10 anim-slide-in">
        <div className="w-14 h-14 rounded-full bg-[#FEF7E0] flex items-center justify-center text-2xl mb-3">🎮</div>
        <p className="font-bold text-[#B06000]">Nice! Practice complete</p>
        <p className="text-xs text-[#5F6368] mt-1">Practice runs don&apos;t go on the leaderboard.</p>
        <button
          type="button"
          onClick={() => handlePlayAgain(activeTab)}
          className="mt-4 min-h-11 border-2 border-[#1A73E8] text-[#1A73E8] font-bold px-6 py-2 rounded-full hover:bg-[#E8F0FE] transition-colors"
        >
          Play again
        </button>
      </div>
    );
  } else {
    body = (
      <div key={`${activeTab}-${runs[activeTab]}`}>
        {renderGame(activeTab, questions, (answer) => completeGame(activeTab, answer))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-2xl text-center mb-6">
        <h1 className="text-xl font-extrabold">Hey {name} 👋</h1>
        <p className="text-sm text-[#5F6368]">
          {chosenDone
            ? 'Your score is ready. Submit it below.'
            : 'Finish your scored game to submit. Other games are practice.'}
        </p>
        {!chosenDone && (
          <button
            type="button"
            onClick={handleChangePick}
            className="mt-1 min-h-11 px-3 text-xs font-semibold text-[#1A73E8] underline"
          >
            Change pick
          </button>
        )}
      </header>

      <div className="w-full max-w-2xl">
        <TabBar
          activeTab={activeTab}
          chosenTab={game}
          completedTabs={new Set<Tab>(chosenDone ? [game] : [])}
          onTabChange={setActiveTab}
        />

        {isChosenTab ? (
          <div className="mb-3 rounded-2xl border border-[#34A853] bg-[#E6F4EA] px-4 py-2 text-center text-xs font-bold text-[#137333]">
            <span>⭐ Scored game</span>
          </div>
        ) : (
          <div className="mb-3 rounded-2xl border border-[#FBBC04] bg-[#FEF7E0] px-4 py-2 text-center text-xs font-bold text-[#B06000]">
            <span>🎮 Practice — doesn&apos;t count toward your score</span>
          </div>
        )}

        <main className="bg-white border border-[#DADCE0] rounded-3xl p-6 md:p-8 shadow-sm mb-4">
          {body}
        </main>

        {error && <p role="alert" className="text-xs text-[#EA4335] text-center mb-2">{error}</p>}

        {chosenDone ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full min-h-12 text-base font-bold py-3.5 rounded-full transition-all shadow bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-60 disabled:cursor-not-allowed text-white"
          >
            {submitting ? 'Submitting…' : 'Submit Score →'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab(game)}
            className="w-full min-h-12 text-sm font-bold py-3.5 rounded-full transition-all border-2 border-[#1A73E8] text-[#1A73E8] bg-white hover:bg-[#E8F0FE]"
          >
            {`Finish your ⭐ ${meta.title} to submit`}
          </button>
        )}
      </div>
    </div>
  );
}
