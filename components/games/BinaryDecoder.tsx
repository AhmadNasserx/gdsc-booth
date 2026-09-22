'use client';

import { useState, useRef } from 'react';

interface Props { playerName: string; onComplete: (score: number) => void; }

function toBinary(str: string): string {
  return str.split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
}

export default function BinaryDecoder({ playerName, onComplete }: Props) {
  const [guess, setGuess] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const doneRef = useRef(false);

  function verify() {
    if (doneRef.current) return;
    const expected = playerName.charAt(0).charCodeAt(0).toString(2).padStart(8, '0');
    const correct = guess.trim() === expected;
    setStatus(correct ? 'correct' : 'wrong');
    doneRef.current = true;
    onComplete(correct ? 100 : 0);
  }

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-1 text-center">Binary Name Decoder</h2>
      <p className="text-xs text-[#5F6368] mb-6 text-center">
        Your name in 8-bit binary:
      </p>

      <div className="w-full bg-[#F8F9FA] border border-[#DADCE0] rounded-2xl p-4 mb-6 text-center">
        <p className="text-xs font-bold text-[#5F6368] mb-1">YOUR NAME IN BINARY:</p>
        <p className="font-mono text-xs md:text-sm text-[#1A73E8] break-all font-semibold">
          {toBinary(playerName)}
        </p>
      </div>

      <div className="w-full border-t border-[#DADCE0] pt-4 flex flex-col items-center">
        <p className="text-xs font-bold mb-3 text-center">
          Mini Challenge: What is the 8-bit binary for &apos;{playerName.charAt(0)}&apos;?
        </p>
        <div className="flex w-full space-x-2">
          <input
            type="text"
            placeholder="e.g. 01000001"
            maxLength={8}
            value={guess}
            disabled={doneRef.current}
            onChange={(e) => setGuess(e.target.value)}
            className="flex-1 p-2.5 border border-[#DADCE0] rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
          />
          <button
            onClick={verify}
            disabled={!guess || doneRef.current}
            className="bg-[#34A853] hover:bg-[#2C8E45] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-semibold"
          >
            Verify
          </button>
        </div>
        {status === 'correct' && (
          <p className="text-xs font-bold text-[#34A853] mt-2">Correct! You earned 100 points! 🎉</p>
        )}
        {status === 'wrong' && (
          <p className="text-xs font-bold text-[#EA4335] mt-2">Not quite — look at the binary above!</p>
        )}
      </div>
    </div>
  );
}
