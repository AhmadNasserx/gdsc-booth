'use client';

import { memo, useCallback, useEffect, useReducer, useRef } from 'react';
import Burst from '@/components/Burst';
import EmojiWarm from '@/components/EmojiWarm';
import type { FlipResponse, RunResult } from '@/lib/apiTypes';
import { feedback } from '@/lib/feedback';
import { text, useT, type Lang } from '@/lib/i18n';
import { MEMORY_EMOJIS } from '@/lib/memoryEmojis';

const MISMATCH_MS = 600;
const WIN_DELAY_MS = 900;
const CONFETTI_COUNT = 24;
const CONFETTI_COLORS = ['#F7B500', '#965D94', '#00A6BA', '#7DB83A', '#E1484B'];

interface Props {
  cards: number;
  act: (body: { flip: number }) => Promise<FlipResponse>;
  onDone: (result: RunResult) => void;
}

/**
 * Per-card state. `pending` is a card that has never been revealed and is waiting for its
 * first answer from the server. `emoji` is the face the server has revealed for the card.
 * It is kept for the rest of the game (the face cache), so a card that was seen once can be
 * shown again at once while the server confirms the flip.
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
  | { type: 'peek'; index: number }
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
      // A face nobody has seen yet: the card turns over and shows a shimmer until the reply.
      const cards = state.cards.map((card, i) =>
        i === action.index ? { ...card, status: 'pending' as const } : card,
      );
      return { ...state, cards, pending: action.index, started: true, error: null };
    }

    case 'peek': {
      // A face the server has revealed before: show it now, the reply confirms it.
      const cards = state.cards.map((card, i) =>
        i === action.index ? { ...card, status: 'up' as const } : card,
      );
      return { ...state, cards, pending: action.index, started: true, error: null };
    }

    case 'unpend': {
      // The card goes back face down. Its cached face, if any, is kept.
      const cards = state.cards.map((card, i) =>
        i === action.index ? { ...card, status: 'down' as const } : card,
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
      className="flex-1 rounded-2xl bg-sci-soft px-2 py-2 text-center"
    >
      <div aria-hidden="true" className="text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div aria-hidden="true" className="text-lg font-black tabular-nums text-ink">
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

interface CardProps {
  index: number;
  status: CardStatus;
  emoji: string | null;
  isWaiting: boolean;
  isMismatch: boolean;
  onFlip: (index: number) => void;
  lang: Lang;
}

/**
 * One card. Memoized on primitive props, so a flip re-renders only the cards that changed and
 * the other buttons keep their DOM nodes.
 */
const MemoCard = memo(function MemoCard({ index, status, emoji, isWaiting, isMismatch, onFlip, lang }: CardProps) {
  const isMatched = status === 'matched';
  const isShimmer = status === 'pending';
  const isUp = isMatched || status === 'up';
  const isFlipped = isUp || isShimmer;
  const faceClass = isMatched
    ? 'border-[#34A853] bg-[#E6F4EA] shadow-[0_0_0_3px_rgba(52,168,83,0.35),0_0_18px_rgba(52,168,83,0.6)]'
    : isMismatch
      ? 'border-[#EA4335] bg-white'
      : 'border-line bg-white';

  return (
    <button
      type="button"
      onClick={() => onFlip(index)}
      aria-label={isUp ? text(lang, 'memory.cardUp', { n: index + 1, emoji: emoji ?? '' }) : text(lang, 'memory.cardDown', { n: index + 1 })}
      aria-disabled={isFlipped || undefined}
      aria-busy={isWaiting || undefined}
      className="relative aspect-square min-h-16 w-full touch-manipulation rounded-xl outline-none [perspective:600px] focus-visible:ring-4 focus-visible:ring-sci"
    >
      <span
        aria-hidden="true"
        className={`memo-flip absolute inset-0 block rounded-xl [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
      >
        <span className="memo-back font-display absolute inset-0 flex items-center justify-center rounded-xl bg-sci text-3xl font-bold text-indigo shadow-md [backface-visibility:hidden]">
          ?
        </span>
        <span
          className={`absolute inset-0 flex items-center justify-center rounded-xl border-2 text-3xl shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)] sm:text-4xl ${faceClass}`}
        >
          {isShimmer ? (
            <span aria-hidden="true" className="memo-shimmer block h-3/5 w-3/5 rounded-lg" />
          ) : (
            <span className={isMatched ? 'font-emoji memo-match-pop inline-block' : 'font-emoji inline-block'}>
              {emoji}
            </span>
          )}
        </span>
      </span>
      {/* Mounted only while matched, so the burst plays once when the pair is found. */}
      {isMatched && <Burst count={10} colors={['#7DB83A', '#F7B500', '#00A6BA']} />}
    </button>
  );
});

export default function MemoryMatch({ cards, act, onDone }: Props) {
  const [state, dispatch] = useReducer(reducer, cards, initialState);
  const { moves, elapsed, started, done, result, mismatch, error } = state;
  const { lang, t } = useT();
  const matchedCount = state.cards.filter((card) => card.status === 'matched').length;

  // Synchronous guard against double taps: set from the tap until the board is free again
  // (response received, mismatch delay over, or game won).
  const busyRef = useRef(false);

  const onDoneRef = useRef(onDone);
  const reportedRef = useRef(false);
  const aliveRef = useRef(true);

  // Read by the stable flip() callback, so a failed flip is explained in the player's language.
  const retryTextRef = useRef(t('memory.retry'));
  useEffect(() => {
    retryTextRef.current = t('memory.retry');
  }, [t]);

  // flip() is a stable callback, so it reads the latest board and act prop through refs.
  const stateRef = useRef(state);
  const actRef = useRef(act);

  useEffect(() => {
    stateRef.current = state;
    actRef.current = act;
  }, [state, act]);

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

  // Stable across renders, so memoized cards do not re-render when the board changes.
  const flip = useCallback((index: number) => {
    if (busyRef.current) return;
    const card = stateRef.current.cards[index];
    if (!card || card.status !== 'down') return;

    busyRef.current = true;
    dispatch(card.emoji === null ? { type: 'pend', index } : { type: 'peek', index });
    feedback('flip');

    actRef.current({ flip: index }).then(
      (response) => {
        if (!aliveRef.current) return;
        // Sound is played here, not in the reducer, which must stay pure.
        if (response.pair === 'match') feedback('match');
        else if (response.pair === 'mismatch') feedback('thud');
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
          error: err instanceof Error ? err.message : retryTextRef.current,
        });
      },
    );
  }, []);

  const status = mismatch ? t('memory.noMatch') : done ? '' : t('memory.find');

  return (
    <div className="flex w-full min-w-0 flex-col items-center anim-slide-in">
      <div className="mb-4 flex w-full max-w-sm gap-2">
        <Stat label={t('memory.moves')} value={moves} />
        <Stat label={t('memory.time')} value={`${elapsed}s`} />
        <Stat label={t('memory.pairs')} value={matchedCount / 2} />
      </div>

      <p aria-live="polite" className="mb-3 h-5 text-center text-xs font-semibold text-muted">
        {status}
      </p>

      <div className="relative w-full max-w-xs sm:max-w-sm">
        {/* Draws every face once so the emoji is rasterised before the first flip. */}
        <EmojiWarm glyphs={MEMORY_EMOJIS} />
        <div role="group" aria-label={t('memory.cards')} className="grid grid-cols-4 gap-2 sm:gap-3">
          {state.cards.map((card, i) => (
            <MemoCard
              key={i}
              index={i}
              status={card.status}
              emoji={card.emoji}
              isWaiting={state.pending === i}
              isMismatch={mismatch?.includes(i) ?? false}
              onFlip={flip}
              lang={lang}
            />
          ))}
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
          {t('memory.done', { moves, secs: Math.max(1, elapsed) })}
        </div>
      )}
    </div>
  );
}
