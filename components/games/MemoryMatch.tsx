'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { FlipResponse, RunResult } from '@/lib/apiTypes';

const MISMATCH_MS = 800;
const WIN_DELAY_MS = 900;
const CONFETTI_COUNT = 24;
const CONFETTI_COLORS = ['#1A73E8', '#34A853', '#FBBC04', '#EA4335'];

interface Props {
  cards: number;
  act: (body: { flip: number }) => Promise<FlipResponse>;
  onDone: (result: RunResult) => void;
}

/**
 * Per-card state. The face (emoji) is unknown until the server answers a flip,
 * so a card only holds an emoji once it has been revealed.
 */
type CardStatus = 'down' | 'pending' | 'up' | 'matched';

interface Card {
  status: CardStatus;
  emoji: string | null;
}

interface State {
  cards: Card[];
  /** Index of the card whose flip request is in flight. */
  pending: number | null;
  /** First card of the current attempt, waiting for its partner. */
  open: number | null;
  /** Both cards of a mismatched attempt, face up until the board flips them back. */
  mismatch: [number, number] | null;
  moves: number;
  started: boolean;
  elapsed: number;
  error: string | null;
  /** The server reported the final match. */
  done: boolean;
  result: RunResult | null;
}

type Action =
  | { type: 'pend'; index: number }
  | { type: 'unpend'; index: number; error: string }
  | { type: 'reveal'; index: number; response: FlipResponse }
  | { type: 'hide' }
  | { type: 'tick' };

function initialState(cards: number): State {
  return {
    cards: Array.from({ length: cards }, () => ({ status: 'down', emoji: null })),
    pending: null,
    open: null,
    mismatch: null,
    moves: 0,
    started: false,
    elapsed: 0,
    error: null,
    done: false,
    result: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'pend': {
      const cards = state.cards.map((card, i) =>
        i === action.index ? { status: 'pending' as const, emoji: null } : card,
      );
      return { ...state, cards, pending: action.index, started: true, error: null };
    }

    case 'unpend': {
      const cards = state.cards.map((card, i) =>
        i === action.index ? { status: 'down' as const, emoji: null } : card,
      );
      return { ...state, cards, pending: null, error: action.error };
    }

    case 'reveal': {
      const { index, response } = action;
      const { pair, other, moves, done, result } = response;
      const emoji = response.emoji;
      const revealed = state.cards.map((card, i) =>
        i === index ? { status: 'up' as const, emoji } : card,
      );
      const base: State = { ...state, cards: revealed, pending: null, error: null, moves };

      if (pair === 'none') {
        return { ...base, open: index };
      }

      const first = other ?? state.open;
      if (first === null) {
        // The server reported a pair without a first card. Treat the flip as an opener.
        return { ...base, open: index };
      }

      if (pair === 'match') {
        const matched = base.cards.map((card, i) =>
          i === first || i === index ? { status: 'matched' as const, emoji: card.emoji } : card,
        );
        return {
          ...base,
          cards: matched,
          open: null,
          done: Boolean(done),
          result: done && result ? result : null,
        };
      }

      // mismatch: both cards stay face up until the hide timer runs.
      return { ...base, open: null, mismatch: [first, index] };
    }

    case 'hide': {
      if (!state.mismatch) return state;
      const [a, b] = state.mismatch;
      const cards = state.cards.map((card, i) =>
        i === a || i === b ? { status: 'down' as const, emoji: card.emoji } : card,
      );
      return { ...state, cards, mismatch: null };
    }

    case 'tick':
      if (!state.started || state.done) return state;
      return { ...state, elapsed: state.elapsed + 1 };

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

export default function MemoryMatch({ cards, act, onDone }: Props) {
  const [state, dispatch] = useReducer(reducer, cards, initialState);
  const { moves, elapsed, started, done, result, mismatch, error } = state;
  const matchedCount = state.cards.filter((card) => card.status === 'matched').length;

  // Synchronous guard against double taps: set from the tap until the board is free again
  // (response received, mismatch delay over, or game won).
  const busyRef = useRef(false);

  const onDoneRef = useRef(onDone);
  const reportedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Game clock: display only (the server measures the real time). Starts on the first tap.
  useEffect(() => {
    if (!started || done) return;
    const id = window.setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => window.clearInterval(id);
  }, [started, done]);

  // Flip mismatched cards back after a short pause; the board is locked until then.
  useEffect(() => {
    if (!mismatch) return;
    const id = window.setTimeout(() => {
      busyRef.current = false;
      dispatch({ type: 'hide' });
    }, MISMATCH_MS);
    return () => window.clearTimeout(id);
  }, [mismatch]);

  // Report the result once, after the celebration has had a moment.
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      onDoneRef.current(result);
    }, WIN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [result]);

  function flip(index: number) {
    if (busyRef.current) return;
    if (state.cards[index]?.status !== 'down') return;

    busyRef.current = true;
    dispatch({ type: 'pend', index });

    act({ flip: index }).then(
      (response) => {
        if (!aliveRef.current) return;
        dispatch({ type: 'reveal', index, response });
        // Keep the board locked for a mismatch (cleared by the hide timer) or after the win.
        busyRef.current = response.pair === 'mismatch' || Boolean(response.done);
      },
      (err: unknown) => {
        if (!aliveRef.current) return;
        busyRef.current = false;
        dispatch({
          type: 'unpend',
          index,
          error: err instanceof Error ? err.message : 'Something went wrong. Try that card again.',
        });
      },
    );
  }

  const status = mismatch ? 'No match, try again' : done ? '' : 'Find the matching pairs';

  return (
    <div className="flex w-full min-w-0 flex-col items-center anim-slide-in">
      <div className="mb-4 flex w-full max-w-sm gap-2">
        <Stat label="Moves" value={moves} />
        <Stat label="Time" value={`${elapsed}s`} />
        <Stat label="Pairs" value={matchedCount / 2} />
      </div>

      <p aria-live="polite" className="mb-3 h-5 text-center text-xs font-semibold text-[#5F6368]">
        {status}
      </p>

      <div className="relative w-full max-w-xs sm:max-w-sm">
        <div role="group" aria-label="Memory cards" className="grid grid-cols-4 gap-2 sm:gap-3">
          {state.cards.map((card, i) => {
            const isMatched = card.status === 'matched';
            const isPending = card.status === 'pending';
            const isUp = isMatched || card.status === 'up';
            const isFlipped = isUp || isPending;
            const isMismatch = mismatch?.includes(i) ?? false;
            const faceClass = isMatched
              ? 'border-[#34A853] bg-[#E6F4EA] shadow-[0_0_0_3px_rgba(52,168,83,0.35),0_0_18px_rgba(52,168,83,0.6)]'
              : isMismatch
                ? 'border-[#EA4335] bg-white'
                : 'border-[#DADCE0] bg-white';

            return (
              <button
                key={i}
                type="button"
                onClick={() => flip(i)}
                aria-label={isUp ? `Card ${i + 1}, ${card.emoji}` : `Card ${i + 1}, face down`}
                aria-disabled={isFlipped || undefined}
                aria-busy={isPending || undefined}
                className="relative aspect-square min-h-16 w-full touch-manipulation rounded-xl outline-none [perspective:600px] focus-visible:ring-4 focus-visible:ring-[#FBBC04]"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-0 block rounded-xl transition-transform duration-500 ease-out motion-reduce:transition-none [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
                >
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-[#1A73E8] text-2xl font-black text-white shadow-md [backface-visibility:hidden]">
                    ?
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center rounded-xl border-2 text-3xl shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)] sm:text-4xl ${faceClass}`}
                  >
                    {isPending ? (
                      <span className="inline-block h-3 w-3 rounded-full bg-[#DADCE0] motion-safe:animate-pulse" />
                    ) : (
                      <span className={isMatched ? 'memo-match-pop inline-block' : 'inline-block'}>
                        {card.emoji}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {done && <Confetti />}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-center text-xs font-semibold text-[#C5221F]">
          {error}
        </p>
      )}

      {done && (
        <div
          role="status"
          className="mt-5 rounded-2xl bg-[#E6F4EA] px-4 py-3 text-center text-sm font-bold text-[#137333] anim-slide-in"
        >
          🎉 All pairs found in {moves} moves · {Math.max(1, elapsed)}s
        </div>
      )}
    </div>
  );
}
