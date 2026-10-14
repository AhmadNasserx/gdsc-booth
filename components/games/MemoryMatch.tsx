'use client';

import { useEffect, useReducer, useRef } from 'react';

const EMOJIS = ['🐍', '⚛️', '🔥', '🐳', '🦀', '☁️', '🤖', '🔐'];
const PAIR_COUNT = EMOJIS.length;
const MISMATCH_MS = 800;
const WIN_DELAY_MS = 900;
const CONFETTI_COUNT = 24;
const CONFETTI_COLORS = ['#1A73E8', '#34A853', '#FBBC04', '#EA4335'];

export interface MemoryResult {
  moves: number;
  seconds: number;
}

interface Props {
  onComplete: (result: MemoryResult) => void;
}

interface Card {
  emoji: string;
}

type Phase = 'loading' | 'playing' | 'resolving' | 'won';

interface State {
  phase: Phase;
  deck: Card[];
  open: number[];
  matched: boolean[];
  moves: number;
  elapsed: number;
  started: boolean;
}

type Action =
  | { type: 'deal'; deck: Card[] }
  | { type: 'flip'; index: number }
  | { type: 'hide' }
  | { type: 'tick' };

const INITIAL: State = {
  phase: 'loading',
  deck: [],
  open: [],
  matched: [],
  moves: 0,
  elapsed: 0,
  started: false,
};

// Fisher-Yates. Math.random is injectable through the global so tests can pin the layout.
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function makeDeck(): Card[] {
  return shuffle(EMOJIS.flatMap((emoji) => [emoji, emoji])).map((emoji) => ({ emoji }));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'deal':
      return {
        ...INITIAL,
        phase: 'playing',
        deck: action.deck,
        matched: action.deck.map(() => false),
      };

    case 'tick':
      if (state.phase === 'loading' || state.phase === 'won') return state;
      return { ...state, elapsed: state.elapsed + 1 };

    case 'hide':
      if (state.phase !== 'resolving') return state;
      return { ...state, phase: 'playing', open: [] };

    case 'flip': {
      if (state.phase !== 'playing') return state;
      if (state.matched[action.index] || state.open.includes(action.index)) return state;

      if (state.open.length === 0) {
        return { ...state, started: true, open: [action.index] };
      }

      const first = state.open[0];
      const second = action.index;
      const moves = state.moves + 1;

      if (state.deck[first].emoji !== state.deck[second].emoji) {
        return { ...state, moves, open: [first, second], phase: 'resolving' };
      }

      const matched = [...state.matched];
      matched[first] = true;
      matched[second] = true;
      const won = matched.every(Boolean);
      return { ...state, moves, matched, open: [], phase: won ? 'won' : 'playing' };
    }

    default:
      return state;
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      role="group"
      aria-label={`${label}: ${value}`}
      className="flex-1 rounded-2xl bg-[#E8F0FE] px-2 py-2 text-center"
    >
      <div aria-hidden="true" className="text-[10px] font-bold uppercase tracking-wider text-[#5F6368]">
        {label}
      </div>
      <div aria-hidden="true" className="text-lg font-black tabular-nums text-[#1A73E8]">
        {value}
      </div>
    </div>
  );
}

function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
        <span
          key={i}
          className="memo-confetti absolute -top-2 block h-3 w-2 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 8) * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function MemoryMatch({ onComplete }: Props) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const { phase, deck, open, matched, moves, elapsed, started } = state;
  const won = phase === 'won';
  const pairs = matched.filter(Boolean).length / 2;
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Deal on mount (not during render) so server and client markup match.
  useEffect(() => {
    dispatch({ type: 'deal', deck: makeDeck() });
  }, []);

  // Game clock: starts on the first flip, stops on win or unmount.
  useEffect(() => {
    if (!started || won) return;
    const id = window.setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => window.clearInterval(id);
  }, [started, won]);

  // Flip mismatched cards back after a short pause.
  useEffect(() => {
    if (phase !== 'resolving') return;
    const id = window.setTimeout(() => dispatch({ type: 'hide' }), MISMATCH_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Report the result once, after the celebration has had a moment.
  useEffect(() => {
    if (!won) return;
    const id = window.setTimeout(() => {
      onCompleteRef.current({ moves, seconds: Math.max(1, elapsed) });
    }, WIN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [won, moves, elapsed]);

  const loading = phase === 'loading';
  const status = phase === 'resolving'
    ? 'No match, try again'
    : won
      ? ''
      : 'Find the matching pairs';

  return (
    <div className="flex w-full min-w-0 flex-col items-center anim-slide-in">
      <div className="mb-4 flex w-full max-w-sm gap-2">
        <Stat label="Moves" value={moves} />
        <Stat label="Time" value={`${elapsed}s`} />
        <Stat label="Pairs" value={`${pairs}/${PAIR_COUNT}`} />
      </div>

      <p aria-live="polite" className="mb-3 h-5 text-center text-xs font-semibold text-[#5F6368]">
        {status}
      </p>

      <div className="relative w-full max-w-xs sm:max-w-sm">
        <div role="group" aria-label="Memory cards" className="grid grid-cols-4 gap-2 sm:gap-3">
          {loading
            ? Array.from({ length: PAIR_COUNT * 2 }, (_, i) => (
                <div key={i} className="aspect-square min-h-16 rounded-xl bg-[#E8F0FE] motion-safe:animate-pulse" />
              ))
            : deck.map((card, i) => {
                const isMatched = matched[i];
                const isUp = isMatched || open.includes(i);
                const isMismatch = phase === 'resolving' && open.includes(i);
                const faceClass = isMatched
                  ? 'border-[#34A853] bg-[#E6F4EA] shadow-[0_0_0_3px_rgba(52,168,83,0.35),0_0_18px_rgba(52,168,83,0.6)]'
                  : isMismatch
                    ? 'border-[#EA4335] bg-white'
                    : 'border-[#DADCE0] bg-white';

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => dispatch({ type: 'flip', index: i })}
                    aria-label={isUp ? `Card ${i + 1}, ${card.emoji}` : `Card ${i + 1}, face down`}
                    aria-disabled={isUp || undefined}
                    className="relative aspect-square min-h-16 w-full touch-manipulation rounded-xl outline-none [perspective:600px] focus-visible:ring-4 focus-visible:ring-[#FBBC04]"
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 block rounded-xl transition-transform duration-500 ease-out motion-reduce:transition-none [transform-style:preserve-3d] ${isUp ? '[transform:rotateY(180deg)]' : ''}`}
                    >
                      <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-[#1A73E8] text-2xl font-black text-white shadow-md [backface-visibility:hidden]">
                        ?
                      </span>
                      <span
                        className={`absolute inset-0 flex items-center justify-center rounded-xl border-2 text-3xl shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)] sm:text-4xl ${faceClass}`}
                      >
                        <span className={isMatched ? 'memo-match-pop inline-block' : 'inline-block'}>
                          {card.emoji}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
        </div>
        {won && <Confetti />}
      </div>

      {won && (
        <div
          role="status"
          className="mt-5 rounded-2xl bg-[#E6F4EA] px-4 py-3 text-center text-sm font-bold text-[#137333] anim-slide-in"
        >
          🎉 All {PAIR_COUNT} pairs found in {moves} moves · {Math.max(1, elapsed)}s
        </div>
      )}
    </div>
  );
}
