'use client';

import { useState, useEffect, useRef } from 'react';
import type { BatchResponse, ReviewItem, RunResult, TriviaView } from '@/lib/apiTypes';
import Burst from '@/components/Burst';
import { feedback } from '@/lib/feedback';
import { useT } from '@/lib/i18n';
import { isVerdictReply, nextStreak, runInOrder, STREAK_MIN, VERDICT_WAIT_MS, type CheckFn, type Verdict } from './verdict';

const GAME_SECS = 35;
// Brief flash after a pick when there is no check to wait for.
const ANSWER_FLASH_MS = 200;
// How long the right/wrong verdict stays on screen. The clock keeps running, so it is kept short.
const VERDICT_MS = 450;
// The last seconds of the clock each give a tick, so the end of the round is heard.
const TICK_SECS = 10;
// Confetti colours for a right answer, from the palette the game already uses.
const BURST_COLORS = ['#7DB83A', '#F7B500', '#00A6BA'];

type Phase = 'start' | 'play' | 'checking' | 'review';

interface Props {
  questions: TriviaView[];
  act: (body: { answers: (string | null)[] }) => Promise<BatchResponse>;
  /** Checks each pick as it is made. Optional: without it the answers are only sent in the final batch. */
  check?: CheckFn;
  onDone: (result: RunResult) => void;
}

function isBatch(res: BatchResponse): boolean {
  return !!res && Array.isArray(res.results) && !!res.result;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function TechTrivia({ questions, act, check, onDone }: Props) {
  const { t, tq } = useT();
  const [phase, setPhase] = useState<Phase>('start');
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  // Right or wrong for the locked-in option, once the server has replied.
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  // Right answers in a row. Only a verdict moves it.
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECS);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Refs hold the guards that timers and async callbacks read, where state would be stale.
  // answersRef is the single source of truth for picks; it is never changed once the round is frozen.
  const answersRef = useRef<(string | null)[]>([]);
  const chosenRef = useRef<string | null>(null);
  const frozenRef = useRef(false);
  const busyRef = useRef(false);
  const timeLeftRef = useRef(GAME_SECS);
  // The verdict callback reads the streak from here, so it never works from a stale render.
  const streakRef = useRef(0);
  const resultRef = useRef<RunResult | null>(null);
  const doneRef = useRef(false);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Counts the picks. A timer or reply from an earlier pick checks it and does nothing if it moved on.
  const pickSeqRef = useRef(0);
  const checkQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    return () => {
      pickSeqRef.current += 1;
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
  }, []);

  function clearAdvance() {
    if (advanceRef.current) {
      clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
  }

  // Sends every pick in one batch. Runs once when the round ends; a failed send can be retried
  // with the same answers, because the server treats a repeated batch as idempotent.
  async function submitRound() {
    if (busyRef.current || doneRef.current) return;
    busyRef.current = true;
    frozenRef.current = true;
    const answers = answersRef.current.slice();
    setPicks(answers);
    setPhase('checking');
    setError(null);

    let res: BatchResponse;
    try {
      const raw = await act({ answers });
      if (!isBatch(raw)) throw new Error('Unexpected response from the server.');
      res = raw;
    } catch (err) {
      busyRef.current = false;
      setError(errorMessage(err, t('common.error')));
      return;
    }

    busyRef.current = false;
    resultRef.current = res.result;
    setReview(res.results);
    setPhase('review');
  }

  function pickOption(opt: string) {
    if (frozenRef.current || chosenRef.current !== null) return;
    feedback('tap');
    const q = idx;
    answersRef.current[q] = opt;
    chosenRef.current = opt;
    setChosen(opt);
    const seq = pickSeqRef.current;

    // Moves on from this pick. Does nothing if the pick was already left.
    const leave = () => {
      if (pickSeqRef.current !== seq) return;
      pickSeqRef.current = seq + 1;
      advanceRef.current = null;
      chosenRef.current = null;
      setChosen(null);
      setVerdict(null);
      if (q + 1 >= questions.length) {
        submitRound();
      } else {
        setIdx(q + 1);
      }
    };

    if (!check) {
      advanceRef.current = setTimeout(leave, ANSWER_FLASH_MS);
      return;
    }

    // If the verdict is slow, the game moves on without it. The reply is then ignored.
    advanceRef.current = setTimeout(leave, VERDICT_WAIT_MS);
    runInOrder(checkQueueRef, () => check({ check: { index: q, answer: opt } })).then(
      (reply) => {
        // Time may have run out while the check was in flight. The round is then already on its way.
        if (pickSeqRef.current !== seq || frozenRef.current) return;
        clearAdvance();
        if (!isVerdictReply(reply)) {
          advanceRef.current = setTimeout(leave, ANSWER_FLASH_MS);
          return;
        }
        const nextRun = nextStreak(streakRef.current, reply.correct);
        streakRef.current = nextRun;
        setStreak(nextRun);
        setVerdict({ option: opt, correct: reply.correct, correctAnswer: reply.correctAnswer });
        if (!reply.correct) feedback('wrong');
        else if (nextRun >= STREAK_MIN) feedback('streak');
        else feedback('correct');
        advanceRef.current = setTimeout(leave, VERDICT_MS);
      },
      () => {
        // A failed check never blocks the round. The answer is still sent with the final batch.
        if (pickSeqRef.current !== seq || frozenRef.current) return;
        clearAdvance();
        advanceRef.current = setTimeout(leave, ANSWER_FLASH_MS);
      },
    );
  }

  // Time ran out: keep whatever was picked (the pick is already recorded) and send the round now.
  function expire() {
    clearAdvance();
    frozenRef.current = true;
    submitRound();
  }

  useEffect(() => {
    if (phase !== 'play') return;
    const id = setTimeout(() => {
      const next = timeLeftRef.current - 1;
      timeLeftRef.current = next;
      setTimeLeft(next);
      if (next > 0 && next <= TICK_SECS) feedback('tick');
      if (next <= 0) expire();
    }, 1000);
    return () => clearTimeout(id);
    // expire and submitRound read only refs and state setters, so the tick effect deliberately ignores them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  function startGame() {
    answersRef.current = questions.map(() => null);
    setPhase('play');
  }

  function finish() {
    const result = resultRef.current;
    if (!result || doneRef.current) return;
    doneRef.current = true;
    onDone(result);
  }

  if (phase === 'start') {
    return (
      <div className="flex flex-col items-center text-center py-8 anim-slide-in">
        <div className="text-5xl mb-4">⚡</div>
        <h2 className="font-display text-3xl font-bold mb-2 text-indigo">{t('trivia.title')}</h2>
        <p className="text-sm text-muted mb-2">{t('trivia.sub')}</p>
        <p className="text-xs text-muted mb-6 bg-sci-soft rounded-xl px-4 py-2">
          {t('trivia.note')}
        </p>
        <button
          type="button"
          onClick={startGame}
          className="bg-sci hover:bg-sci-deep active:scale-95 text-ink px-10 py-3 rounded-full font-bold shadow-md transition-all"
        >
          {t('trivia.start')}
        </button>
      </div>
    );
  }

  if (phase === 'review' && review) {
    const correctCount = review.filter((item) => item.answered && item.correct).length;
    const unansweredCount = review.filter((item) => !item.answered).length;
    return (
      <div className="flex flex-col items-center w-full anim-slide-in">
        <h2 className="font-display text-2xl font-bold mb-1 text-indigo">{t('game.yourAnswers')}</h2>
        <p className="text-sm text-muted mb-5">
          {t('trivia.correctCount', { n: correctCount })}
          {unansweredCount > 0 ? t('trivia.unansweredCount', { n: unansweredCount }) : ''}
        </p>

        <ol className="w-full flex flex-col gap-2 mb-6">
          {review.map((item, i) => {
            const mark = !item.answered ? '—' : item.correct ? '✓' : '✗';
            const label = t(!item.answered ? 'game.noAnswer' : item.correct ? 'game.correct' : 'trivia.wrong');
            const markColor = !item.answered
              ? 'text-muted'
              : item.correct
              ? 'text-[#137333]'
              : 'text-[#C5221F]';
            return (
              <li key={i} className="flex gap-3 items-start rounded-2xl border-2 border-line bg-white px-4 py-3">
                <span className={`text-base font-black w-5 shrink-0 text-center ${markColor}`}>
                  <span className="sr-only">{label}: </span>
                  <span aria-hidden="true">{mark}</span>
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold text-ink">
                    <span className="text-muted">Q{i + 1}.</span> {tq(questions[i]?.question ?? '')}
                  </p>
                  {item.answered && !item.correct && picks[i] && (
                    <p className="text-xs text-muted mt-1">{t('trivia.yourAnswer', { answer: tq(picks[i] as string) })}</p>
                  )}
                  <p className="text-xs text-[#137333] mt-1">{t('game.correctAnswer', { answer: tq(String(item.correctAnswer)) })}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          onClick={finish}
          className="bg-sci hover:bg-sci-deep active:scale-95 text-ink px-10 py-3 rounded-full font-bold shadow-md transition-all"
        >
          {t('game.continue')}
        </button>
      </div>
    );
  }

  if (phase === 'checking') {
    return (
      <div className="flex flex-col items-center w-full anim-slide-in py-8">
        {error ? (
          <div
            role="alert"
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-[#EA4335] bg-[#FCE8E6] px-4 py-3 text-sm font-semibold text-[#C5221F]"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void submitRound()}
              className="rounded-full bg-sci px-5 py-2 text-xs font-bold text-ink shadow-md transition-all hover:bg-sci-deep active:scale-95"
            >
              {t('play.tryAgain')}
            </button>
          </div>
        ) : (
          <p role="status" className="text-sm font-semibold text-muted">
            {t('game.checking')}
          </p>
        )}
      </div>
    );
  }

  const q = questions[idx];
  const timerPct = (timeLeft / GAME_SECS) * 100;
  const timerColor = timeLeft <= 8 ? 'text-[#EA4335] bg-[#FCE8E6]' : timeLeft <= 17 ? 'text-sci-ink bg-sci-soft' : 'text-[#34A853] bg-[#E6F4EA]';

  // Look of one option. Before a verdict the picked option is neutral; after it, right and wrong show.
  function toneOf(opt: string): string {
    if (verdict && chosen === opt) {
      return verdict.correct
        ? 'anim-pop anim-flash-green bg-[#E6F4EA] border-[#34A853] text-[#137333]'
        : 'anim-shake anim-flash-red bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]';
    }
    if (verdict && verdict.correctAnswer === opt) return 'bg-[#E6F4EA] border-[#34A853] text-[#137333]';
    if (chosen !== null) {
      return chosen === opt
        ? 'anim-pop bg-sci-soft border-sci text-ink'
        : 'border-line text-muted-2 bg-mist';
    }
    return 'border-line bg-white hover:border-sci hover:bg-sci-soft';
  }

  const pillTone = !verdict
    ? 'border-sci bg-sci-soft text-ink'
    : verdict.correct
      ? 'border-[#34A853] bg-[#E6F4EA] text-[#137333]'
      : 'border-[#EA4335] bg-[#FCE8E6] text-[#C5221F]';

  return (
    <div className="flex flex-col items-center w-full anim-slide-in">
      <div className="w-full flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-muted">Q{idx + 1}</span>
        <span className={`text-sm font-black px-3 py-1 rounded-full transition-colors ${timerColor}`}>
          ⏱ {timeLeft}s
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={t('trivia.timeLeft')}
        aria-valuemin={0}
        aria-valuemax={GAME_SECS}
        aria-valuenow={timeLeft}
        className="progress-track h-1.5 w-full mb-5"
      >
        <div className="progress-fill" style={{ transform: `scaleX(${timerPct / 100})` }} />
      </div>

      <div className="w-full h-9 mb-3 flex items-center justify-center" role="status">
        {chosen !== null && (
          <span className={`rounded-xl border px-4 py-1.5 text-xs font-bold ${pillTone}`}>
            {verdict ? t(verdict.correct ? 'trivia.right' : 'trivia.notQuite') : t('trivia.locked')}
          </span>
        )}
      </div>

      {q && (
        <>
          <h3 className="text-base font-bold mb-5 text-ink text-center">{tq(q.question)}</h3>

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

          <div className="w-full flex flex-col gap-2.5">
            {q.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => pickOption(opt)}
                disabled={chosen !== null}
                className={`relative w-full p-3.5 text-left text-sm font-semibold border-2 rounded-2xl transition-all active:scale-[0.98] disabled:cursor-default ${toneOf(opt)}`}
              >
                {tq(opt)}
                {verdict && verdict.correct && chosen === opt && (
                  <Burst key={idx} count={14} colors={BURST_COLORS} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
