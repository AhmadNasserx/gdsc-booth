'use client';

import { useState, useRef } from 'react';

interface Riddle { emojis: string; hint: string; options: string[]; answer: string; }

const RIDDLES: Riddle[] = [
  { emojis: '🕷️ 🌐', hint: 'Scrapes and indexes the web', options: ['Web Crawler','Bug Bounty','Docker','Firewall'], answer: 'Web Crawler' },
  { emojis: '📦 🔄 🚢', hint: 'Containerization platform', options: ['Kubernetes','GitLab','Docker','Linux'], answer: 'Docker' },
  { emojis: '🔑 🔒 📜', hint: 'Encrypts communication online', options: ['SSL/TLS','DNS','HTTP','VPN'], answer: 'SSL/TLS' },
  { emojis: '🐍 💻 ⚡', hint: 'Popular programming language', options: ['Python','C++','JavaScript','Rust'], answer: 'Python' },
];

interface Props { onComplete: (score: number) => void; }

export default function EmojiRiddles({ onComplete }: Props) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const completedRef = useRef(false);

  function handleAnswer(opt: string) {
    if (answered) return;
    setAnswered(true);
    setChosen(opt);
    const newScore = opt === RIDDLES[idx].answer ? score + 25 : score;
    if (opt === RIDDLES[idx].answer) setScore(newScore);

    setTimeout(() => {
      if (idx < RIDDLES.length - 1) {
        setIdx((p) => p + 1);
        setAnswered(false);
        setChosen(null);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete(newScore);
      }
    }, 1200);
  }

  const riddle = RIDDLES[idx];

  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-xs font-bold text-[#1A73E8] uppercase tracking-wider bg-[#E8F0FE] px-3 py-1 rounded-full mb-4">
        Question {idx + 1} of {RIDDLES.length}
      </span>
      <div className="text-6xl my-4 tracking-widest">{riddle.emojis}</div>
      <p className="text-sm text-[#5F6368] mb-6 italic">Hint: {riddle.hint}</p>
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {riddle.options.map((opt) => {
          const isCorrect = opt === riddle.answer;
          const isChosen = opt === chosen;
          return (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              className={`p-4 text-sm font-medium rounded-2xl border transition-all ${
                answered
                  ? isCorrect
                    ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333] font-bold'
                    : isChosen
                    ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                    : 'border-[#DADCE0] text-[#5F6368]'
                  : 'border-[#DADCE0] hover:border-[#1A73E8] hover:bg-[#F8F9FA]'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <p className="text-xs font-semibold text-[#5F6368]">Score: {score}</p>
    </div>
  );
}
