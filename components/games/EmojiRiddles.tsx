'use client';

import { useState, useRef } from 'react';
import type { Riddle } from '@/lib/questions';

interface Props {
  questions: Riddle[];
  onComplete: (answers: string[]) => void;
}

export default function EmojiRiddles({ questions, onComplete }: Props) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [animType, setAnimType] = useState<'pop' | 'shake' | null>(null);
  const completedRef = useRef(false);
  const answersRef = useRef<string[]>([]);

  function handleAnswer(opt: string) {
    if (chosen) return;
    const riddle = questions[idx];
    const correct = opt === riddle.answer;
    setChosen(opt);
    setAnimType(correct ? 'pop' : 'shake');
    setAnimKey((k) => k + 1);
    answersRef.current.push(opt);
    if (correct) setScore((s) => s + 25);

    setTimeout(() => {
      setAnimType(null);
      if (idx < questions.length - 1) {
        setIdx((p) => p + 1);
        setChosen(null);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete(answersRef.current);
      }
    }, 1100);
  }

  const riddle = questions[idx];

  return (
    <div
      key={animKey}
      className={`flex flex-col items-center text-center ${animType === 'pop' ? 'anim-pop' : animType === 'shake' ? 'anim-shake' : ''}`}
    >
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-xs font-bold text-[#1A73E8] uppercase tracking-wider bg-[#E8F0FE] px-3 py-1 rounded-full">
          Question {idx + 1} of {questions.length}
        </span>
        <span className="text-xs font-bold text-[#34A853]">{score} pts</span>
      </div>

      <div className="text-6xl my-4 tracking-widest">{riddle.emojis}</div>
      <p className="text-sm text-[#5F6368] mb-6 italic">Hint: {riddle.hint}</p>

      <div className="w-full grid grid-cols-2 gap-3 mb-2">
        {riddle.options.map((opt) => {
          const isCorrect = opt === riddle.answer;
          const isChosen = opt === chosen;
          return (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              disabled={!!chosen}
              className={`p-4 text-sm font-semibold rounded-2xl border-2 transition-all duration-150 ${
                chosen
                  ? isCorrect
                    ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333]'
                    : isChosen
                    ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                    : 'border-[#DADCE0] text-[#9AA0A6] bg-[#F8F9FA]'
                  : 'border-[#DADCE0] bg-white hover:border-[#1A73E8] hover:bg-[#E8F0FE] active:scale-95'
              }`}
            >
              {chosen && isCorrect ? '✓ ' : chosen && isChosen ? '✗ ' : ''}{opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
