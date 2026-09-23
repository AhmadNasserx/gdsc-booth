'use client';

import { useState, useRef } from 'react';

interface Props {
  playerName: string;
  binaryChar: string;
  onComplete: (answer: string) => void;
}

function toBinary(str: string): string {
  return str.split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
}

function makeChoices(letter: string): string[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const idx = letters.indexOf(letter);
  const wrong = new Set<string>();
  let tries = 0;
  while (wrong.size < 3 && tries < 60) {
    tries++;
    const off = Math.floor(Math.random() * 6) - 3;
    const adj = letters[(idx + off + 26) % 26];
    if (adj !== letter) wrong.add(adj);
  }
  return [letter, ...wrong].sort(() => Math.random() - 0.5);
}

export default function BinaryDecoder({ playerName, binaryChar, onComplete }: Props) {
  const binary = binaryChar.charCodeAt(0).toString(2).padStart(8, '0');
  const [choices] = useState(() => makeChoices(binaryChar));
  const [chosen, setChosen] = useState<string | null>(null);
  const [animType, setAnimType] = useState<'pop' | 'shake' | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const doneRef = useRef(false);

  function handleChoice(opt: string) {
    if (doneRef.current || chosen) return;
    const correct = opt === binaryChar;
    setChosen(opt);
    setAnimType(correct ? 'pop' : 'shake');
    setAnimKey((k) => k + 1);
    doneRef.current = true;
    setTimeout(() => {
      setAnimType(null);
      onComplete(opt);
    }, 1000);
  }

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-1 text-center">Binary Decoder 🔢</h2>
      <p className="text-xs text-[#5F6368] mb-5 text-center">
        Your name encoded in 8-bit binary:
      </p>

      <div className="w-full bg-[#F8F9FA] border border-[#DADCE0] rounded-2xl p-4 mb-6 text-center">
        <p className="text-[10px] font-bold text-[#5F6368] mb-1 uppercase tracking-wide">
          {playerName.toUpperCase()} in binary
        </p>
        <p className="font-mono text-xs text-[#1A73E8] break-all font-semibold leading-relaxed">
          {toBinary(playerName.toUpperCase())}
        </p>
      </div>

      <div className="w-full border-t border-[#DADCE0] pt-5">
        <p className="text-xs font-bold text-[#5F6368] text-center mb-2 uppercase tracking-wide">
          Mini Challenge
        </p>
        <p className="text-sm font-semibold text-center mb-1">Which letter does this binary represent?</p>
        <div
          key={animKey}
          className={`font-mono text-xl font-black text-center text-[#1A73E8] bg-[#E8F0FE] rounded-2xl py-4 mb-5 tracking-widest ${
            animType === 'pop' ? 'anim-pop' : animType === 'shake' ? 'anim-shake' : ''
          }`}
        >
          {binary}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {choices.map((opt) => {
            const isCorrect = opt === binaryChar;
            const isChosen = opt === chosen;
            return (
              <button
                key={opt}
                onClick={() => handleChoice(opt)}
                disabled={!!chosen}
                className={`py-4 text-xl font-black rounded-2xl border-2 transition-all active:scale-95 ${
                  chosen
                    ? isCorrect
                      ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333]'
                      : isChosen
                      ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                      : 'bg-[#F8F9FA] border-[#DADCE0] text-[#9AA0A6]'
                    : 'bg-white border-[#DADCE0] hover:border-[#1A73E8] hover:bg-[#E8F0FE]'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {chosen && (
          <p className={`text-sm font-bold text-center mt-4 anim-slide-in ${chosen === binaryChar ? 'text-[#34A853]' : 'text-[#EA4335]'}`}>
            {chosen === binaryChar
              ? `Correct! ${binary} = '${binaryChar}' (ASCII ${binaryChar.charCodeAt(0)}) 🎉`
              : `Not quite — ${binary} = '${binaryChar}' (ASCII ${binaryChar.charCodeAt(0)})`}
          </p>
        )}
      </div>
    </div>
  );
}
