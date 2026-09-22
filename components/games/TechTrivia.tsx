'use client';

import { useState, useEffect, useRef } from 'react';

interface Question { question: string; options: string[]; answer: string; }

const QUESTIONS: Question[] = [
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs','Global Data Science Center','General Developer Software Council','Google Design & Code'], answer: 'Google Developer Student Clubs' },
  { question: 'Which Google framework is used for cross-platform mobile apps?', options: ['Flutter','React Native','Angular','Kotlin Multiplatform'], answer: 'Flutter' },
  { question: "What is Google's flagship AI model family?", options: ['Gemini','Llama','Claude','GPT'], answer: 'Gemini' },
];

interface Props { onComplete: (score: number) => void; }

export default function TechTrivia({ onComplete }: Props) {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(10);
  const completedRef = useRef(false);
  const scoreRef = useRef(0);

  function advance(correct: boolean, remaining: number) {
    const bonus = correct ? 25 + Math.floor(remaining / 10 * 8) : 0;
    scoreRef.current += bonus;
    setScore(scoreRef.current);
    if (idx < QUESTIONS.length - 1) {
      setIdx((p) => p + 1);
      setTimer(10);
    } else if (!completedRef.current) {
      completedRef.current = true;
      setActive(false);
      onComplete(scoreRef.current);
    }
  }

  useEffect(() => {
    if (!active) return;
    if (timer === 0) { advance(false, 0); return; }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [active, timer, idx]);

  if (!active) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <h2 className="text-xl font-bold mb-2">10-Second Speed Trivia</h2>
        <p className="text-sm text-[#5F6368] mb-6">Answer before the clock hits zero!</p>
        <button
          onClick={() => { setIdx(0); setScore(0); scoreRef.current = 0; setTimer(10); completedRef.current = false; setActive(true); }}
          className="bg-[#1A73E8] hover:bg-[#1557B0] text-white px-8 py-3 rounded-full font-semibold shadow-md"
        >
          Start Speed Trivia
        </button>
      </div>
    );
  }

  const q = QUESTIONS[idx];
  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-[#5F6368]">Question {idx + 1}/3</span>
        <span className="text-sm font-black text-[#EA4335] bg-[#FCE8E6] px-3 py-1 rounded-full">
          ⏱ {timer}s
        </span>
      </div>
      <h3 className="text-lg font-bold mb-6 text-[#202124] text-center">{q.question}</h3>
      <div className="w-full flex flex-col space-y-3">
        {q.options.map((opt) => (
          <button
            key={opt}
            onClick={() => advance(opt === q.answer, timer)}
            className="w-full p-4 text-left text-sm font-medium border border-[#DADCE0] rounded-2xl hover:border-[#1A73E8] hover:bg-[#E8F0FE] transition-all"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
