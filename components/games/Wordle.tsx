'use client';

import { useState, useEffect, useCallback } from 'react';

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'active';

interface Props {
  word: string;
  hint: string;
  onComplete: (guesses: string[]) => void;
}

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

function tileStyle(state: LetterState, revealed: boolean): string {
  const base = 'flex items-center justify-center w-12 h-12 text-lg font-black rounded border-2 select-none transition-colors duration-150';
  if (!revealed) {
    if (state === 'active') return `${base} border-[#9AA0A6] bg-white text-[#202124]`;
    return `${base} border-[#DADCE0] bg-white text-[#202124]`;
  }
  switch (state) {
    case 'correct': return `${base} bg-[#34A853] border-[#34A853] text-white`;
    case 'present': return `${base} bg-[#FBBC04] border-[#FBBC04] text-white`;
    case 'absent':  return `${base} bg-[#5F6368] border-[#5F6368] text-white`;
    default:        return `${base} border-[#DADCE0] bg-white text-[#202124]`;
  }
}

function keyStyle(state: LetterState | undefined): string {
  const base = 'flex items-center justify-center h-12 rounded font-bold text-sm select-none cursor-pointer transition-colors active:scale-95';
  switch (state) {
    case 'correct': return `${base} bg-[#34A853] text-white`;
    case 'present': return `${base} bg-[#FBBC04] text-white`;
    case 'absent':  return `${base} bg-[#5F6368] text-white`;
    default:        return `${base} bg-[#E8EAED] text-[#202124]`;
  }
}

function evaluateGuess(guess: string, word: string): LetterState[] {
  const result: LetterState[] = Array(WORD_LENGTH).fill('absent');
  const wordArr = word.split('');
  const guessArr = guess.split('');
  const used = Array(WORD_LENGTH).fill(false);
  const correctPositions = new Set<number>();

  // First pass: correct positions
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === wordArr[i]) {
      result[i] = 'correct';
      used[i] = true;
      correctPositions.add(i);
    }
  }
  // Second pass: present letters
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (correctPositions.has(i)) continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guessArr[i] === wordArr[j]) {
        result[i] = 'present';
        used[j] = true;
        break;
      }
    }
  }
  return result;
}

export default function Wordle({ word, hint, onComplete }: Props) {
  const [guesses, setGuesses] = useState<string[]>([]);
  const [results, setResults] = useState<LetterState[][]>([]);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(false);
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState('');

  const keyStates = (() => {
    const map: Record<string, LetterState> = {};
    guesses.forEach((g, ri) => {
      results[ri]?.forEach((state, ci) => {
        const letter = g[ci];
        const prev = map[letter];
        // Upgrade only: correct > present > absent
        if (prev === 'correct') return;
        if (state === 'correct' || state === 'present' || !prev) map[letter] = state;
      });
    });
    return map;
  })();

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2000);
  }, []);

  const submit = useCallback(() => {
    if (current.length !== WORD_LENGTH) { setShake(true); setTimeout(() => setShake(false), 500); return; }
    const evaluation = evaluateGuess(current, word);
    const newGuesses = [...guesses, current];
    const newResults = [...results, evaluation];
    setGuesses(newGuesses);
    setResults(newResults);
    setCurrent('');

    const solved = current === word;
    if (solved || newGuesses.length === MAX_GUESSES) {
      setDone(true);
      if (!solved) showMessage(`The word was ${word}`);
      setTimeout(() => onComplete(newGuesses), solved ? 800 : 2200);
    }
  }, [current, word, guesses, results, onComplete, showMessage]);

  const press = useCallback((key: string) => {
    if (done) return;
    if (key === 'ENTER') { submit(); return; }
    if (key === '⌫' || key === 'BACKSPACE') { setCurrent((c) => c.slice(0, -1)); return; }
    if (/^[A-Z]$/.test(key) && current.length < WORD_LENGTH) setCurrent((c) => c + key);
  }, [done, current, submit]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => press(e.key === 'Backspace' ? 'BACKSPACE' : e.key.toUpperCase());
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [press]);

  const scoreHint = ['300', '250', '200', '150', '100', '50'];

  return (
    <div className="flex flex-col items-center w-full anim-slide-in">
      <div className="w-full flex justify-between items-center mb-1">
        <h2 className="text-base font-bold text-[#202124]">Tech Wordle</h2>
        <span className="text-xs text-[#5F6368]">{guesses.length}/{MAX_GUESSES} guesses</span>
      </div>
      <p className="text-xs text-[#5F6368] mb-1 self-start">Guess the 5-letter word</p>
      <p className="text-xs italic text-[#9AA0A6] mb-4 self-start">💡 {hint}</p>

      {/* Score hint row */}
      <div className="w-full flex gap-1 mb-4">
        {scoreHint.map((pts, i) => (
          <div key={i} className={`flex-1 text-center text-[10px] font-bold rounded py-0.5 ${
            i < guesses.length ? 'bg-[#DADCE0] text-[#9AA0A6]' : 'bg-[#E8F0FE] text-[#1A73E8]'
          }`}>
            {i < guesses.length ? '—' : pts}
          </div>
        ))}
      </div>

      {/* Message toast */}
      {message && (
        <div className="mb-3 bg-[#202124] text-white text-xs font-bold px-4 py-2 rounded-full">
          {message}
        </div>
      )}

      {/* Grid */}
      <div className="flex flex-col gap-1.5 mb-4">
        {Array.from({ length: MAX_GUESSES }, (_, row) => {
          const submitted = row < guesses.length;
          const isActive = row === guesses.length && !done;
          const rowLetters = submitted ? guesses[row] : isActive ? current.padEnd(WORD_LENGTH) : '';
          return (
            <div key={row} className={`flex gap-1.5 ${isActive && shake ? 'anim-shake' : ''}`}>
              {Array.from({ length: WORD_LENGTH }, (_, col) => {
                const letter = rowLetters[col] ?? '';
                const state: LetterState = submitted
                  ? (results[row]?.[col] ?? 'empty')
                  : isActive && letter.trim()
                  ? 'active'
                  : 'empty';
                return (
                  <div key={col} className={tileStyle(state, submitted)}>
                    {letter.trim()}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Keyboard */}
      <div className="flex flex-col gap-1.5 w-full max-w-xs">
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1 justify-center">
            {row.map((key) => {
              const isWide = key === 'ENTER' || key === '⌫';
              return (
                <button
                  key={key}
                  onClick={() => press(key)}
                  style={{ minWidth: isWide ? '4rem' : '2rem' }}
                  className={keyStyle(keyStates[key])}
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
