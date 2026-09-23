'use client';

import { useState, useEffect, useRef } from 'react';
import type { TriviaQuestion } from '@/lib/questions';

const GAME_SECS = 35;
const CORRECT_PTS = 20;
const WRONG_PENALTY = 10;
const CORRECT_DELAY_MS = 600;
const WRONG_LOCKOUT_MS = 1500;

export interface TriviaAnswer { answer: string; }

interface Props {
  questions: TriviaQuestion[];
  onComplete: (answers: TriviaAnswer[]) => void;
}

export default function TechTrivia({ questions, onComplete }: Props) {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECS);
  const [chosen, setChosen] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const completedRef = useRef(false);
  const activeRef = useRef(false);
  const scoreRef = useRef(0);
  const idxRef = useRef(0);
  const answersRef = useRef<TriviaAnswer[]>([]);

  function finish() {
    if (completedRef.current) return;
    completedRef.current = true;
    activeRef.current = false;
    setActive(false);
    onComplete(answersRef.current);
  }

  function advance(isWrong: boolean) {
    const delay = isWrong ? WRONG_LOCKOUT_MS : CORRECT_DELAY_MS;
    setTimeout(() => {
      if (!activeRef.current) return;
      const nextIdx = idxRef.current + 1;
      if (nextIdx >= questions.length) { finish(); return; }
      idxRef.current = nextIdx;
      setIdx(nextIdx);
      setChosen(null);
      setLocked(false);
    }, delay);
  }

  function handleAnswer(opt: string) {
    if (chosen !== null || locked || !activeRef.current) return;
    const correct = opt === questions[idxRef.current].answer;
    answersRef.current.push({ answer: opt });
    setChosen(opt);
    if (correct) {
      scoreRef.current += CORRECT_PTS;
      setScore(scoreRef.current);
    } else {
      scoreRef.current = Math.max(0, scoreRef.current - WRONG_PENALTY);
      setScore(scoreRef.current);
      setLocked(true);
    }
    advance(!correct);
  }

  useEffect(() => {
    if (!active) return;
    if (timeLeft <= 0) { finish(); return; }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, timeLeft]);

  function startGame() {
    idxRef.current = 0;
    scoreRef.current = 0;
    answersRef.current = [];
    completedRef.current = false;
    activeRef.current = true;
    setIdx(0);
    setScore(0);
    setTimeLeft(GAME_SECS);
    setChosen(null);
    setLocked(false);
    setActive(true);
  }

  if (!active) {
    return (
      <div className="flex flex-col items-center text-center py-8 anim-slide-in">
        <div className="text-5xl mb-4">⚡</div>
        <h2 className="text-xl font-bold mb-2">Speed Trivia</h2>
        <p className="text-sm text-[#5F6368] mb-2">35 seconds · answer as many as you can</p>
        <p className="text-xs text-[#5F6368] mb-6 bg-[#E8F0FE] rounded-xl px-4 py-2">
          Correct → +{CORRECT_PTS} pts · Wrong → −{WRONG_PENALTY} pts + {WRONG_LOCKOUT_MS / 1000}s wait
        </p>
        <button
          onClick={startGame}
          className="bg-[#1A73E8] hover:bg-[#1557B0] active:scale-95 text-white px-10 py-3 rounded-full font-bold shadow-md transition-all"
        >
          Start!
        </button>
      </div>
    );
  }

  const q = questions[idx];
  const timerPct = (timeLeft / GAME_SECS) * 100;
  const timerColor = timeLeft <= 8 ? 'text-[#EA4335] bg-[#FCE8E6]' : timeLeft <= 17 ? 'text-[#FBBC04] bg-[#FEF9E5]' : 'text-[#34A853] bg-[#E6F4EA]';

  return (
    <div className="flex flex-col items-center w-full anim-slide-in">
      <div className="w-full flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-[#5F6368]">
          Q{idx + 1} · <span className="text-[#1A73E8]">{score} pts</span>
        </span>
        <span className={`text-sm font-black px-3 py-1 rounded-full transition-colors ${timerColor}`}>
          ⏱ {timeLeft}s
        </span>
      </div>

      <div className="w-full bg-[#DADCE0] h-1.5 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-[#1A73E8] transition-all duration-1000"
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {locked && (
        <div className="w-full bg-[#FCE8E6] border border-[#EA4335] rounded-xl px-4 py-2 mb-3 text-center text-xs font-bold text-[#C5221F]">
          Wrong! −{WRONG_PENALTY} pts · Next question in {WRONG_LOCKOUT_MS / 1000}s…
        </div>
      )}

      <h3 className="text-base font-bold mb-5 text-[#202124] text-center">{q.question}</h3>

      <div className="w-full flex flex-col gap-2.5">
        {q.options.map((opt) => {
          const isCorrect = opt === q.answer;
          const isChosen = opt === chosen;
          const isDisabled = chosen !== null || locked;
          return (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              disabled={isDisabled}
              className={`w-full p-3.5 text-left text-sm font-semibold border-2 rounded-2xl transition-all active:scale-[0.98] ${
                chosen
                  ? isCorrect
                    ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333]'
                    : isChosen
                    ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                    : 'border-[#DADCE0] text-[#9AA0A6] bg-[#F8F9FA]'
                  : locked
                  ? 'border-[#DADCE0] text-[#9AA0A6] bg-[#F8F9FA]'
                  : 'border-[#DADCE0] bg-white hover:border-[#1A73E8] hover:bg-[#E8F0FE]'
              }`}
            >
              {chosen && isCorrect ? '✓ ' : chosen && isChosen && !isCorrect ? '✗ ' : ''}{opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
