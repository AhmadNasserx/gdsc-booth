'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

// Animation timing (ms). Keep in sync with the keyframes in app/globals.css.
const FLIP_MS = 300;
const FLIP_STAGGER_MS = 250;
const REVEAL_MS = (WORD_LENGTH - 1) * FLIP_STAGGER_MS + FLIP_MS; // last tile settles at 1300
const SHAKE_MS = 450;
const TOAST_MS = 1500;
const WIN_HOLD_MS = 1500;  // onComplete fires this long after the final reveal
const LOSS_HOLD_MS = 2500; // onComplete fires this long after the final reveal

const WIN_MESSAGES = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
const CONFETTI_COLORS = ['#34A853', '#FBBC04', '#4285F4', '#EA4335', '#A142F4', '#24C1E0'];
const CONFETTI_COUNT = 30;

type LetterState = 'correct' | 'present' | 'absent';
type TileView = 'empty' | 'filled' | 'pending' | LetterState;
type ToastTone = 'info' | 'win' | 'loss';

interface Props {
  word: string;
  hint: string;
  onComplete: (guesses: string[]) => void;
}

// BACKSPACE is an internal key id; it is rendered as an icon.
const KEYBOARD_ROWS: string[][] = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','BACKSPACE'],
];

const TILE_BASE =
  'flex aspect-square w-[clamp(46px,15vw,64px)] shrink-0 items-center justify-center rounded-md border-2 font-black uppercase leading-none select-none text-[clamp(1.25rem,5vw,1.75rem)] transition-colors duration-150';

const TILE_TONE: Record<TileView, string> = {
  empty:   'border-[#DADCE0] bg-white text-[#202124]',
  filled:  'border-[#9AA0A6] bg-white text-[#202124]',
  pending: 'border-[#9AA0A6] bg-white text-[#202124]',
  correct: 'border-[#34A853] bg-[#34A853] text-white',
  present: 'border-[#FBBC04] bg-[#FBBC04] text-[#202124]',
  absent:  'border-[#5F6368] bg-[#5F6368] text-white',
};

const KEY_TONE: Record<LetterState | 'idle', string> = {
  idle:    'bg-[#E8EAED] text-[#202124] active:bg-[#D2D5DA]',
  correct: 'bg-[#34A853] text-white active:bg-[#2C8E46]',
  present: 'bg-[#FBBC04] text-[#202124] active:bg-[#E0A500]',
  absent:  'bg-[#5F6368] text-white active:bg-[#4A4D50]',
};

const TOAST_TONE: Record<ToastTone, string> = {
  info: 'bg-[#202124]',
  win:  'bg-[#34A853]',
  loss: 'bg-[#202124]',
};

const STATE_LABEL: Record<LetterState, string> = {
  correct: 'correct',
  present: 'present',
  absent: 'absent',
};

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

/** Key colours from the first `count` rows only, so keys never spoil a row that is still flipping. */
function buildKeyStates(
  guesses: string[],
  results: LetterState[][],
  count: number,
): Record<string, LetterState> {
  const map: Record<string, LetterState> = {};
  for (let ri = 0; ri < count; ri++) {
    results[ri]?.forEach((state, ci) => {
      const letter = guesses[ri][ci];
      const prev = map[letter];
      // Upgrade only: correct > present > absent
      if (prev === 'correct') return;
      if (state === 'correct' || state === 'present' || !prev) map[letter] = state;
    });
  }
  return map;
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

function buzz(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined') navigator.vibrate?.(pattern);
  } catch {
    // Vibration is optional and may be blocked; ignore.
  }
}

function confettiStyle(i: number): CSSProperties {
  return {
    left: '50%',
    top: '35%',
    width: `${6 + (i % 3) * 2}px`,
    height: `${10 + (i % 2) * 4}px`,
    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    borderRadius: i % 3 === 0 ? '9999px' : '2px',
    animationDelay: `${(i % 6) * 40}ms`,
    '--dx': `${((i * 73) % 281) - 140}px`,
    '--dy': `${120 + ((i * 53) % 160)}px`,
    '--rot': `${((i * 47) % 720) - 360}deg`,
  } as CSSProperties;
}

function BackspaceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 md:h-6 md:w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <path d="m18 9-6 6M12 9l6 6" />
    </svg>
  );
}

export default function Wordle({ word, hint, onComplete }: Props) {
  const [guesses, setGuesses] = useState<string[]>([]);
  const [results, setResults] = useState<LetterState[][]>([]);
  const [current, setCurrent] = useState('');
  const [done, setDone] = useState(false);
  const [settled, setSettled] = useState(0);          // rows whose flip has fully finished
  const [animRow, setAnimRow] = useState<number | null>(null);
  const [animCols, setAnimCols] = useState(0);        // tiles in animRow that already show their colour
  const [shaking, setShaking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [toast, setToast] = useState<{ id: number; text: string; tone: ToastTone } | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const lockedRef = useRef(false);     // true while a row is revealing, and after the game ends
  const finishedRef = useRef(false);   // guarantees onComplete fires exactly once
  const timersRef = useRef<number[]>([]);
  const toastSeq = useRef(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Every timer goes through `later` so it can be cancelled on unmount.
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const showToast = useCallback((text: string, tone: ToastTone, autoHide = true) => {
    const id = ++toastSeq.current;
    setToast({ id, text, tone });
    if (autoHide) {
      later(() => setToast((t) => (t && t.id === id ? null : t)), TOAST_MS);
    }
  }, [later]);

  const submit = useCallback(() => {
    if (lockedRef.current) return;

    if (current.length !== WORD_LENGTH) {
      buzz(30);
      setShaking(true);
      setShakeKey((k) => k + 1);
      later(() => setShaking(false), SHAKE_MS);
      showToast('Not enough letters', 'info');
      return;
    }

    lockedRef.current = true;
    const evaluation = evaluateGuess(current, word);
    const rowIndex = guesses.length;
    const newGuesses = [...guesses, current];
    const solved = current === word;
    const over = solved || newGuesses.length === MAX_GUESSES;
    const reduce = prefersReducedMotion();

    setGuesses(newGuesses);
    setResults([...results, evaluation]);
    setCurrent('');
    setAnimRow(rowIndex);
    setAnimCols(reduce ? WORD_LENGTH : 0);
    if (over) setDone(true);

    if (!reduce) {
      for (let i = 0; i < WORD_LENGTH; i++) {
        // Colour switches at the flip midpoint of each tile.
        later(() => setAnimCols(i + 1), i * FLIP_STAGGER_MS + FLIP_MS / 2);
      }
    }

    later(() => {
      setSettled(newGuesses.length);
      setAnimRow(null);
      setAnimCols(0);

      if (!over) {
        lockedRef.current = false;
        return;
      }

      const finish = () => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onCompleteRef.current(newGuesses);
      };

      if (solved) {
        setCelebrate(true);
        buzz([20, 40, 20]);
        showToast(WIN_MESSAGES[newGuesses.length - 1] ?? 'Great!', 'win', false);
        later(finish, WIN_HOLD_MS);
      } else {
        showToast(`The word was ${word}`, 'loss', false);
        later(finish, LOSS_HOLD_MS);
      }
    }, reduce ? 0 : REVEAL_MS);
  }, [current, word, guesses, results, later, showToast]);

  const press = useCallback((key: string) => {
    if (lockedRef.current) return;
    if (key === 'ENTER') {
      buzz(10);
      submit();
      return;
    }
    if (key === 'BACKSPACE') {
      buzz(10);
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (/^[A-Z]$/.test(key)) {
      buzz(10);
      setCurrent((c) => (c.length < WORD_LENGTH ? c + key : c));
    }
  }, [submit]);

  // Physical keyboard.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      // preventDefault so a focused on-screen button does not also click.
      if (e.key === ' ') {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) press('ENTER');
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        press('BACKSPACE');
        return;
      }
      if (e.key.length !== 1 || e.repeat) return;
      const letter = e.key.toUpperCase();
      if (/^[A-Z]$/.test(letter)) press(letter);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [press]);

  const keyStates = buildKeyStates(guesses, results, settled);
  const winRow = guesses.length - 1;

  return (
    <div className="flex w-full flex-col items-center anim-slide-in">
      <div className="mb-1 flex w-full items-center justify-between">
        <h2 className="text-base font-bold text-[#202124]">Tech Wordle</h2>
        <span className="text-xs text-[#5F6368]">{guesses.length}/{MAX_GUESSES} guesses</span>
      </div>
      <p className="mb-2 w-full text-xs text-[#5F6368]">Guess the 5-letter word</p>

      {/* Hint chip: appears after 2 guesses. Fixed height so the layout does not jump. */}
      <div className="mb-2 flex h-7 w-full items-center justify-center">
        {guesses.length >= 2 && (
          <p className="anim-slide-in inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#FBBC04] bg-[#FEF7E0] px-3 py-1 text-xs font-semibold text-[#8A5A00]">
            <span aria-hidden="true">💡</span>
            <span className="truncate">Hint: {hint}</span>
          </p>
        )}
      </div>

      {/* Toast: always mounted so screen readers announce it */}
      <div role="status" aria-live="polite" className="mb-2 flex h-9 w-full items-center justify-center">
        {toast && (
          <div
            key={toast.id}
            className={`anim-pop rounded-full px-4 py-1.5 text-sm font-bold text-white shadow ${TOAST_TONE[toast.tone]}`}
          >
            {toast.text}
          </div>
        )}
      </div>

      {/* Grid */}
      <div role="grid" aria-label="Guesses" className="relative mb-4 flex flex-col items-center gap-1.5 md:gap-2">
        {Array.from({ length: MAX_GUESSES }, (_, row) => {
          const isSubmitted = row < guesses.length;
          const isActive = row === guesses.length && !done;
          const flipping = row === animRow;
          const rowShaking = shaking && row === guesses.length;
          const rowKey = row === guesses.length ? `active-${shakeKey}` : `row-${row}`;

          return (
            <div
              key={rowKey}
              role="row"
              style={{ perspective: '600px' }}
              className={`flex justify-center gap-1.5 md:gap-2 ${rowShaking ? 'anim-shake' : ''}`}
            >
              {Array.from({ length: WORD_LENGTH }, (_, col) => {
                const letter = isSubmitted
                  ? guesses[row][col]
                  : isActive
                  ? (current[col] ?? '')
                  : '';

                let view: TileView = 'empty';
                if (isSubmitted) {
                  const revealed = row < settled || (flipping && col < animCols);
                  view = revealed ? results[row][col] : 'pending';
                } else if (letter) {
                  view = 'filled';
                }

                const isWinTile = celebrate && row === winRow;
                const classes = [
                  TILE_BASE,
                  TILE_TONE[view],
                  flipping ? 'wordle-flip' : '',
                  isWinTile ? 'wordle-bounce' : '',
                  isActive && letter ? 'anim-pop' : '',
                ].filter(Boolean).join(' ');

                const delay = flipping
                  ? col * FLIP_STAGGER_MS
                  : isWinTile
                  ? col * 90
                  : undefined;

                const stateText = view === 'correct' || view === 'present' || view === 'absent' ? `, ${STATE_LABEL[view]}` : '';
                const ariaLabel = `row ${row + 1} column ${col + 1}, ${letter ? `letter ${letter}` : 'empty'}${stateText}`;

                return (
                  <div
                    key={`${col}-${letter}`}
                    role="gridcell"
                    aria-label={ariaLabel}
                    className={classes}
                    style={delay !== undefined ? { animationDelay: `${delay}ms` } : undefined}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          );
        })}

        {celebrate && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
              <span key={i} className="wordle-confetti" style={confettiStyle(i)} />
            ))}
          </div>
        )}
      </div>

      {/* On-screen keyboard: full card width, Wordle-style rows */}
      <div
        className="flex w-full select-none flex-col gap-1.5 md:gap-2"
        onKeyUp={(e) => {
          // Stop Space/Enter from activating a focused key on release.
          if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
        }}
      >
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} className="flex w-full gap-1.5 md:gap-2">
            {ri === 1 && <span aria-hidden="true" className="min-w-0 flex-[0.5]" />}
            {row.map((key) => {
              const isWide = key === 'ENTER' || key === 'BACKSPACE';
              const state = isWide ? undefined : keyStates[key];
              const tone = KEY_TONE[state ?? 'idle'];
              const ariaLabel =
                key === 'ENTER' ? 'Enter'
                : key === 'BACKSPACE' ? 'Backspace'
                : state ? `${key}, ${STATE_LABEL[state]}` : key;

              return (
                <button
                  key={key}
                  type="button"
                  aria-label={ariaLabel}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => press(key)}
                  className={`wordle-key flex h-14 min-w-0 touch-manipulation cursor-pointer items-center justify-center rounded-lg font-bold transition-[transform,background-color] duration-75 select-none active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A73E8] md:h-16 ${
                    isWide ? 'flex-[1.5] text-[10px] sm:text-xs md:text-sm' : 'flex-1 text-[15px] sm:text-base md:text-lg'
                  } ${tone}`}
                >
                  {key === 'BACKSPACE' ? <BackspaceIcon /> : key}
                </button>
              );
            })}
            {ri === 1 && <span aria-hidden="true" className="min-w-0 flex-[0.5]" />}
          </div>
        ))}
      </div>
    </div>
  );
}
