'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TabBar from '@/components/TabBar';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import TechTrivia from '@/components/games/TechTrivia';
import BinaryDecoder from '@/components/games/BinaryDecoder';
import PasswordChallenge from '@/components/games/PasswordChallenge';
import Wordle from '@/components/games/Wordle';
import SuccessScreen from '@/components/SuccessScreen';
import type { Tab } from '@/lib/types';
import type { Riddle, TriviaQuestion } from '@/lib/questions';

interface ClientQuestions {
  riddles: Riddle[];
  trivia: TriviaQuestion[];
  binaryChar: string;
  wordleWord: string;
  wordleHint: string;
}

interface GameAnswers {
  riddles: string[] | null;
  trivia: { answer: string }[] | null;
  binary: string | null;
  password: string | null;
  wordle: string[] | null;
}

export default function PlayPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [questions, setQuestions] = useState<ClientQuestions | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('riddles');
  const [answers, setAnswers] = useState<GameAnswers>({
    riddles: null, trivia: null, binary: null, password: null, wordle: null,
  });
  const [result, setResult] = useState<{ rank: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = sessionStorage.getItem('playerToken');
    const n = sessionStorage.getItem('playerName');
    const q = sessionStorage.getItem('playerQuestions');
    if (!t || !n || !q) { router.push('/'); return; }
    setToken(t);
    setName(n);
    try { setQuestions(JSON.parse(q)); } catch { router.push('/'); }
  }, [router]);

  function handleComplete(tab: Tab, answer: GameAnswers[Tab]) {
    setAnswers((prev) => ({ ...prev, [tab]: answer }));
  }

  const completedTabs = new Set(
    (Object.entries(answers) as [Tab, unknown][])
      .filter(([, v]) => v !== null)
      .map(([k]) => k),
  );
  const allDone = completedTabs.size === 4;

  async function handleSubmit() {
    if (!allDone || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const submissionId = crypto.randomUUID();
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, submissionId, answers }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Submission failed');
      setResult(await res.json());
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
          <SuccessScreen name={name} total={result.total} rank={result.rank} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-2xl text-center mb-6">
        <h1 className="text-xl font-extrabold">Hey {name} 👋</h1>
        <p className="text-sm text-[#5F6368]">Complete all 4 games to submit your score</p>
      </header>

      <div className="w-full max-w-2xl">
        <TabBar activeTab={activeTab} completedTabs={completedTabs} onTabChange={setActiveTab} />

        <main className="bg-white border border-[#DADCE0] rounded-3xl p-6 md:p-8 shadow-sm mb-4">
          {activeTab === 'riddles' && (
            <EmojiRiddles
              questions={questions.riddles}
              onComplete={(a) => handleComplete('riddles', a)}
            />
          )}
          {activeTab === 'trivia' && (
            <TechTrivia
              questions={questions.trivia}
              onComplete={(a) => handleComplete('trivia', a)}
            />
          )}
          {activeTab === 'binary' && (
            <BinaryDecoder
              playerName={name}
              binaryChar={questions.binaryChar}
              onComplete={(a) => handleComplete('binary', a)}
            />
          )}
          {activeTab === 'password' && (
            <PasswordChallenge onComplete={(a) => handleComplete('password', a)} />
          )}
          {activeTab === 'wordle' && (
            <Wordle
              word={questions.wordleWord}
              hint={questions.wordleHint}
              onComplete={(a) => handleComplete('wordle', a)}
            />
          )}
        </main>

        {error && <p className="text-xs text-[#EA4335] text-center mb-2">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!allDone || submitting}
          className="w-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full transition-all shadow"
        >
          {submitting ? 'Submitting…' : 'Submit Score'}
        </button>
      </div>
    </div>
  );
}
