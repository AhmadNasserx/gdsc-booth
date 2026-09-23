'use client';

import { useState, useEffect, useRef } from 'react';
import { pickRandom, type TriviaQuestion, TRIVIA_POOL } from '@/lib/questions';

const QUESTION_COUNT = 3;
const TIMER_SECS = 10;

// Per-question max: 25 base + floor(10/10 * 8) speed = 33. 3 × 33 = 99 = MAX_TRIVIA_SCORE.
function calcBonus(correct: boolean, remaining: number): number {
  return correct ? 25 + Math.floor((remaining / TIMER_SECS) * 8) : 0;
}

interface Props { onComplete: (score: number) => void; }

export default function TechTrivia({ onComplete }: Props) {
  const [questions] = useState<TriviaQuestion[]>(() => pickRandom(TRIVIA_POOL, QUESTION_COUNT));
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(TIMER_SECS);
  const [chosen, setChosen] = useState<string | null>(null);
  const completedRef = useRef(false);
  const scoreRef = useRef(0);

  function advance(correct: boolean, remaining: number) {
    const bonus = calcBonus(correct, remaining);
    scoreRef.current = Math.min(scoreRef.current + bonus, 99);
    setScore(scoreRef.current);
    setChosen(questions[idx].answer); // reveal correct answer briefly

    setTimeout(() => {
      if (idx < questions.length - 1) {
        setIdx((p) => p + 1);
        setTimer(TIMER_SECS);
        setChosen(null);
      } else if (!completedRef.current) {
        completedRef.current = true;
        setActive(false);
        onComplete(scoreRef.current);
      }
    }, 900);
  }

  function handleAnswer(opt: string) {
    if (chosen) return;
    setChosen(opt);
    advance(opt === questions[idx].answer, timer);
  }

  useEffect(() => {
    if (!active || chosen) return;
    if (timer === 0) { advance(false, 0); return; }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, timer, idx, chosen]);

  if (!active) {
    return (
      <div className="flex flex-col items-center text-center py-8 anim-slide-in">
        <div className="text-5xl mb-4">⚡</div>
        <h2 className="text-xl font-bold mb-2">Speed Trivia</h2>
        <p className="text-sm text-[#5F6368] mb-2">{QUESTION_COUNT} questions · 10 seconds each</p>
        <p className="text-xs text-[#5F6368] mb-6 bg-[#E8F0FE] rounded-xl px-4 py-2">Answer fast for bonus points!</p>
        <button
          onClick={() => {
            setIdx(0); setScore(0); scoreRef.current = 0;
            setTimer(TIMER_SECS); setChosen(null);
            completedRef.current = false; setActive(true);
          }}
          className="bg-[#1A73E8] hover:bg-[#1557B0] active:scale-95 text-white px-10 py-3 rounded-full font-bold shadow-md transition-all"
        >
          Start!
        </button>
      </div>
    );
  }

  const q = questions[idx];
  const timerColor = timer <= 3 ? 'text-[#EA4335] bg-[#FCE8E6]' : timer <= 6 ? 'text-[#FBBC04] bg-[#FEF9E5]' : 'text-[#34A853] bg-[#E6F4EA]';

  return (
    <div className="flex flex-col items-center w-full anim-slide-in">
      <div className="w-full flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-[#5F6368]">
          Question {idx + 1}/{QUESTION_COUNT} · <span className="text-[#1A73E8]">{score} pts</span>
        </span>
        <span className={`text-sm font-black px-3 py-1 rounded-full transition-colors ${timerColor}`}>
          ⏱ {timer}s
        </span>
      </div>

      <div className="w-full bg-[#DADCE0] h-1 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-[#1A73E8] transition-all duration-1000"
          style={{ width: `${(timer / TIMER_SECS) * 100}%` }}
        />
      </div>

      <h3 className="text-base font-bold mb-5 text-[#202124] text-center">{q.question}</h3>

      <div className="w-full flex flex-col gap-2.5">
        {q.options.map((opt) => {
          const isCorrect = opt === q.answer;
          const isChosen = opt === chosen;
          return (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              disabled={!!chosen}
              className={`w-full p-3.5 text-left text-sm font-semibold border-2 rounded-2xl transition-all active:scale-[0.98] ${
                chosen
                  ? isCorrect
                    ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333]'
                    : isChosen
                    ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                    : 'border-[#DADCE0] text-[#9AA0A6] bg-[#F8F9FA]'
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
