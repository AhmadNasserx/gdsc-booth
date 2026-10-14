'use client';

import { useEffect, useRef, useState } from 'react';
import type { BatchResponse, ReviewItem, RiddleView, RunResult } from '@/lib/apiTypes';

// Short neutral "locked in" pause before the next question. No network involved.
const PICK_MS = 250;

type Phase = 'play' | 'checking' | 'error' | 'review';

interface Props {
  questions: RiddleView[];
  act: (body: { answers: (string | null)[] }) => Promise<BatchResponse>;
  onDone: (result: RunResult) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

export default function EmojiRiddles({ questions, act, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  // Option locked in for the current question, shown neutrally until the transition ends.
  const [picked, setPicked] = useState<string | null>(null);
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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
      setError(errorMessage(err));
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

    const next = answersRef.current.slice();
    next[idx] = opt;
    answersRef.current = next;
    setAnswers(next);
    setPicked(opt);

    const isLast = idx === questions.length - 1;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setPicked(null);
      if (isLast) {
        void submit();
        return;
      }
      lockedRef.current = false;
      setIdx((i) => i + 1);
    }, PICK_MS);
  }

  function finish() {
    if (!finalResult || doneRef.current) return;
    doneRef.current = true;
    onDone(finalResult);
  }

  if (phase === 'review') {
    return (
      <section aria-labelledby="riddle-review-heading" className="flex w-full flex-col anim-slide-in">
        <h2 id="riddle-review-heading" className="mb-4 text-center text-lg font-black text-[#202124]">
          Your answers
        </h2>
        <ol className="flex flex-col gap-3">
          {questions.map((riddle, i) => {
            const item = review[i];
            const answered = item?.answered === true;
            const correct = answered && item.correct;
            const yourPick = answers[i];
            const tone = !answered
              ? 'border-[#DADCE0] bg-[#F8F9FA] text-[#5F6368]'
              : correct
                ? 'border-[#34A853] bg-[#E6F4EA] text-[#137333]'
                : 'border-[#EA4335] bg-[#FCE8E6] text-[#C5221F]';
            const mark = !answered ? '—' : correct ? '✓' : '✗';
            const label = !answered ? 'Unanswered' : correct ? 'Correct' : 'Incorrect';
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
                  <p className="text-sm text-[#202124]">Your pick: {yourPick ?? 'No answer'}</p>
                  <p className="text-sm text-[#202124]">Correct answer: {item ? String(item.correctAnswer) : '—'}</p>
                  {item?.explanation && <p className="mt-1 text-xs text-[#5F6368]">{item.explanation}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={finish}
          disabled={!finalResult}
          className="mt-6 w-full rounded-full bg-[#1A73E8] py-3 font-bold text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95 disabled:opacity-60"
        >
          Continue
        </button>
      </section>
    );
  }

  if (phase === 'checking' || phase === 'error') {
    return (
      <div className="flex w-full flex-col items-center gap-4 py-10 text-center anim-slide-in">
        {phase === 'checking' ? (
          <p role="status" className="text-sm font-bold text-[#5F6368]">
            Checking your answers…
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
              className="rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  const riddle = questions[idx];
  if (!riddle) {
    return <p className="py-8 text-center text-sm text-[#5F6368]">No riddles this round.</p>;
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex w-full items-center justify-center">
        <span className="rounded-full bg-[#E8F0FE] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#1A73E8]">
          Question {idx + 1} of {questions.length}
        </span>
      </div>

      <div key={idx} className="flex w-full flex-col items-center anim-slide-in">
        <div className="my-4 text-6xl tracking-widest">{riddle.emojis}</div>
        <p className="mb-6 text-sm italic text-[#5F6368]">Hint: {riddle.hint}</p>

        <div className="mb-2 grid w-full grid-cols-2 gap-3">
          {riddle.options.map((opt) => {
            const isPicked = picked === opt;
            const dimmed = picked !== null && !isPicked;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => pick(opt)}
                disabled={picked !== null}
                className={`rounded-2xl border-2 p-4 text-sm font-semibold transition-all duration-150 ${
                  isPicked
                    ? 'anim-pop border-[#1A73E8] bg-[#E8F0FE] text-[#1A73E8]'
                    : dimmed
                      ? 'border-[#DADCE0] bg-[#F8F9FA] text-[#9AA0A6]'
                      : 'border-[#DADCE0] bg-white hover:border-[#1A73E8] hover:bg-[#E8F0FE] active:scale-95'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
