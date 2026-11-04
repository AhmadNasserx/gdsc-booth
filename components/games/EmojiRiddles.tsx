'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BatchResponse, ReviewItem, RiddleView, RunResult } from '@/lib/apiTypes';
import Burst from '@/components/Burst';
import EmojiWarm from '@/components/EmojiWarm';
import { feedback } from '@/lib/feedback';
import { useT } from '@/lib/i18n';
import { isVerdictReply, nextStreak, runInOrder, STREAK_MIN, VERDICT_WAIT_MS, type CheckFn, type Verdict } from './verdict';

// Short neutral "locked in" pause before the next question when there is no check to wait for.
const PICK_MS = 250;
// How long the right/wrong verdict stays on screen before the next question.
const VERDICT_MS = 600;
// Confetti colours for a right answer, from the palette the game already uses.
const BURST_COLORS = ['#7DB83A', '#F7B500', '#00A6BA'];

type Phase = 'play' | 'checking' | 'error' | 'review';

interface Props {
  questions: RiddleView[];
  act: (body: { answers: (string | null)[] }) => Promise<BatchResponse>;
  /** Checks each pick as it is made. Optional: without it the answers are only sent in the final batch. */
  check?: CheckFn;
  onDone: (result: RunResult) => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Memoized so the emoji line keeps its identity; the question block's key still replays the slide-in.
const RiddleEmojis = memo(function RiddleEmojis({ emojis }: { emojis: string }) {
  return <div className="my-4 text-6xl tracking-widest font-emoji">{emojis}</div>;
});

interface OptionButtonProps {
  opt: string;
  /** What the button shows: the option in the player's language. `opt` stays the English value. */
  label: string;
  tone: string;
  disabled: boolean;
  onPick: (opt: string) => void;
  /** Question index when the correct burst plays on this option, otherwise null. */
  burstKey: number | null;
}

// Memoized so an option is not redrawn when only the verdict of another option changes.
const OptionButton = memo(function OptionButton({ opt, label, tone, disabled, onPick, burstKey }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onPick(opt)}
      disabled={disabled}
      className={`relative rounded-2xl border-2 p-4 text-sm font-semibold transition-all duration-150 ${tone}`}
    >
      {label}
      {burstKey !== null && <Burst key={burstKey} count={14} colors={BURST_COLORS} />}
    </button>
  );
});

export default function EmojiRiddles({ questions, act, check, onDone }: Props) {
  const { t, tq } = useT();
  const [idx, setIdx] = useState(0);
  // Option locked in for the current question, shown neutrally until the transition ends.
  const [picked, setPicked] = useState<string | null>(null);
  // Right or wrong for the locked-in option, once the server has replied.
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  // Right answers in a row. Only a verdict moves it.
  const [streak, setStreak] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>(() => questions.map(() => null));
  const [phase, setPhase] = useState<Phase>('play');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [finalResult, setFinalResult] = useState<RunResult | null>(null);

  // Refs hold the source of truth for guards and retries, so taps and retries never see stale state.
  const answersRef = useRef<(string | null)[]>(questions.map(() => null));
  const lockedRef = useRef(false);
  const inFlightRef = useRef(false);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The verdict callback reads the streak from here, so it never works from a stale render.
  const streakRef = useRef(0);
  // Counts the picks. A timer or reply from an earlier pick checks it and does nothing if it moved on.
  const pickSeqRef = useRef(0);
  const checkQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // Every emoji glyph in the round, drawn once up front. The whole round arrives in one start response.
  const glyphs = useMemo(
    () => questions.flatMap((riddle) => riddle.emojis.split(/\s+/).filter(Boolean)),
    [questions],
  );

  useEffect(() => {
    return () => {
      pickSeqRef.current += 1;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function submit() {
    if (inFlightRef.current || doneRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setPhase('checking');

    let res: BatchResponse;
    try {
      res = await act({ answers: answersRef.current.slice() });
    } catch (err) {
      inFlightRef.current = false;
      setError(errorMessage(err, t('common.error')));
      setPhase('error');
      return;
    }

    inFlightRef.current = false;
    setReview(res.results);
    setFinalResult(res.result);
    setPhase('review');
  }

  function pick(opt: string) {
    if (lockedRef.current) return;
    lockedRef.current = true;
    feedback('tap');

    const next = answersRef.current.slice();
    next[idx] = opt;
    answersRef.current = next;
    setAnswers(next);
    setPicked(opt);

    const q = idx;
    const isLast = q === questions.length - 1;
    const seq = pickSeqRef.current;

    // Moves on from this pick. Does nothing if the pick was already left.
    const leave = () => {
      if (pickSeqRef.current !== seq) return;
      pickSeqRef.current = seq + 1;
      timerRef.current = null;
      setPicked(null);
      setVerdict(null);
      if (isLast) {
        void submit();
        return;
      }
      lockedRef.current = false;
      setIdx(q + 1);
    };

    if (!check) {
      timerRef.current = setTimeout(leave, PICK_MS);
      return;
    }

    // If the verdict is slow, the game moves on without it. The reply is then ignored.
    timerRef.current = setTimeout(leave, VERDICT_WAIT_MS);
    runInOrder(checkQueueRef, () => check({ check: { index: q, answer: opt } })).then(
      (reply) => {
        if (pickSeqRef.current !== seq) return;
        clearTimer();
        if (!isVerdictReply(reply)) {
          timerRef.current = setTimeout(leave, PICK_MS);
          return;
        }
        const nextRun = nextStreak(streakRef.current, reply.correct);
        streakRef.current = nextRun;
        setStreak(nextRun);
        setVerdict({ option: opt, correct: reply.correct, correctAnswer: reply.correctAnswer });
        if (!reply.correct) feedback('wrong');
        else if (nextRun >= STREAK_MIN) feedback('streak');
        else feedback('correct');
        timerRef.current = setTimeout(leave, VERDICT_MS);
      },
      () => {
        // A failed check never blocks the game. The answer is still sent with the final batch.
        if (pickSeqRef.current !== seq) return;
        clearTimer();
        timerRef.current = setTimeout(leave, PICK_MS);
      },
    );
  }

  // The memoized options get one handler that never changes. It runs the latest pick, which is
  // the one from the last committed render, so a tap always sees the current question.
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });
  const onPick = useCallback((opt: string) => pickRef.current(opt), []);

  function finish() {
    if (!finalResult || doneRef.current) return;
    doneRef.current = true;
    onDone(finalResult);
  }

  if (phase === 'review') {
    return (
      <section aria-labelledby="riddle-review-heading" className="flex w-full flex-col anim-slide-in">
        <h2 id="riddle-review-heading" className="mb-4 text-center text-lg font-black text-ink">
          {t('game.yourAnswers')}
        </h2>
        <ol className="flex flex-col gap-3">
          {questions.map((riddle, i) => {
            const item = review[i];
            const answered = item?.answered === true;
            const correct = answered && item.correct;
            const yourPick = answers[i];
            const tone = !answered
              ? 'border-line bg-mist text-muted'
              : correct
                ? 'border-[#34A853] bg-[#E6F4EA] text-[#137333]'
                : 'border-[#EA4335] bg-[#FCE8E6] text-[#C5221F]';
            const mark = !answered ? '—' : correct ? '✓' : '✗';
            const label = t(!answered ? 'game.unanswered' : correct ? 'game.correct' : 'game.incorrect');
            return (
              <li key={i} className={`flex gap-3 rounded-2xl border-2 p-4 text-left ${tone}`}>
                <span aria-hidden="true" className="shrink-0 text-xl font-black">
                  {mark}
                </span>
                <span className="sr-only">{label}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl tracking-widest" aria-hidden="true">
                    {riddle.emojis}
                  </p>
                  <p className="text-sm text-ink">{t('riddles.yourPick', { pick: yourPick ? tq(yourPick) : t('game.noAnswer') })}</p>
                  <p className="text-sm text-ink">{t('game.correctAnswer', { answer: item ? tq(String(item.correctAnswer)) : '—' })}</p>
                  {item?.explanation && <p className="mt-1 text-xs text-muted">{item.explanation}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={finish}
          disabled={!finalResult}
          className="mt-6 w-full rounded-full bg-sci py-3 font-bold text-ink shadow-md transition-all hover:bg-sci-deep active:scale-95 disabled:opacity-60"
        >
          {t('game.continue')}
        </button>
      </section>
    );
  }

  if (phase === 'checking' || phase === 'error') {
    return (
      <div className="flex w-full flex-col items-center gap-4 py-10 text-center anim-slide-in">
        {phase === 'checking' ? (
          <p role="status" className="text-sm font-bold text-muted">
            {t('game.checking')}
          </p>
        ) : (
          <div
            role="alert"
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-[#EA4335] bg-[#FCE8E6] px-4 py-3 text-sm font-semibold text-[#C5221F]"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void submit()}
              className="rounded-full bg-sci px-5 py-2 text-xs font-bold text-ink shadow-md transition-all hover:bg-sci-deep active:scale-95"
            >
              {t('play.tryAgain')}
            </button>
          </div>
        )}
      </div>
    );
  }

  const riddle = questions[idx];
  if (!riddle) {
    return <p className="py-8 text-center text-sm text-muted">{t('riddles.none')}</p>;
  }

  // Look of one option. Before a verdict the picked option is neutral; after it, right and wrong show.
  function toneOf(opt: string): string {
    if (verdict && picked === opt) {
      return verdict.correct
        ? 'anim-pop anim-flash-green border-[#34A853] bg-[#E6F4EA] text-[#137333]'
        : 'anim-shake anim-flash-red border-[#EA4335] bg-[#FCE8E6] text-[#C5221F]';
    }
    if (verdict && verdict.correctAnswer === opt) return 'border-[#34A853] bg-[#E6F4EA] text-[#137333]';
    if (picked === opt) return 'anim-pop border-sci bg-sci-soft text-ink';
    if (picked !== null) return 'border-line bg-mist text-muted-2';
    return 'border-line bg-white hover:border-sci hover:bg-sci-soft active:scale-95';
  }

  return (
    <div className="flex flex-col items-center text-center">
      <EmojiWarm glyphs={glyphs} />

      <div className="mb-4 flex w-full items-center justify-center">
        <span className="rounded-full bg-sci-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-ink">
          {t('riddles.question', { n: idx + 1, total: questions.length })}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={t('riddles.progress')}
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={idx + 1}
        className="progress-track h-1.5 w-full mb-4"
      >
        <div className="progress-fill" style={{ transform: `scaleX(${(idx + 1) / questions.length})` }} />
      </div>

      <div key={idx} className="flex w-full flex-col items-center anim-slide-in">
        <RiddleEmojis emojis={riddle.emojis} />
        <p className="mb-6 text-sm italic text-muted">{t('riddles.hint', { hint: tq(riddle.hint) })}</p>

        {streak >= STREAK_MIN && (
          <div className="mb-3 flex justify-center" aria-hidden="true">
            {/* Keyed by the count so the entrance plays again on each new streak. */}
            <span
              key={streak}
              className="streak-pop rounded-full bg-sci px-3 py-1 text-xs font-black text-ink"
            >
              {t('game.streak', { n: streak })}
            </span>
          </div>
        )}

        <div className="mb-2 grid w-full grid-cols-2 gap-3">
          {riddle.options.map((opt) => (
            <OptionButton
              key={opt}
              opt={opt}
              label={tq(opt)}
              tone={toneOf(opt)}
              disabled={picked !== null}
              onPick={onPick}
              burstKey={verdict && verdict.correct && picked === opt ? idx : null}
            />
          ))}
        </div>

        <p role="status" className="sr-only">
          {verdict ? (verdict.correct ? t('game.correct') : t('riddles.notQuite', { answer: tq(verdict.correctAnswer) })) : ''}
        </p>
      </div>
    </div>
  );
}
