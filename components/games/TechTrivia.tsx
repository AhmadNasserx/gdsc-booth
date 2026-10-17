'use client';

import { useState, useEffect, useRef } from 'react';
import type { BatchResponse, ReviewItem, RunResult, TriviaView } from '@/lib/apiTypes';

const GAME_SECS = 35;
const ANSWER_FLASH_MS = 200;

type Phase = 'start' | 'play' | 'checking' | 'review';

interface Props {
  questions: TriviaView[];
  act: (body: { answers: (string | null)[] }) => Promise<BatchResponse>;
  onDone: (result: RunResult) => void;
}

function isBatch(res: BatchResponse): boolean {
  return !!res && Array.isArray(res.results) && !!res.result;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

export default function TechTrivia({ questions, act, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('start');
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
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
  const resultRef = useRef<RunResult | null>(null);
  const doneRef = useRef(false);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
  }, []);

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
      setError(errorMessage(err));
      return;
    }

    busyRef.current = false;
    resultRef.current = res.result;
    setReview(res.results);
    setPhase('review');
  }

  function pickOption(opt: string) {
    if (frozenRef.current || chosenRef.current !== null) return;
    const q = idx;
    answersRef.current[q] = opt;
    chosenRef.current = opt;
    setChosen(opt);
    advanceRef.current = setTimeout(() => {
      advanceRef.current = null;
      chosenRef.current = null;
      setChosen(null);
      if (q + 1 >= questions.length) {
        submitRound();
      } else {
        setIdx(q + 1);
      }
    }, ANSWER_FLASH_MS);
  }

  // Time ran out: keep whatever was picked (the pick is already recorded) and send the round now.
  function expire() {
    if (advanceRef.current) {
      clearTimeout(advanceRef.current);
      advanceRef.current = null;
    }
    frozenRef.current = true;
    submitRound();
  }

  useEffect(() => {
    if (phase !== 'play') return;
    const id = setTimeout(() => {
      const next = timeLeftRef.current - 1;
      timeLeftRef.current = next;
      setTimeLeft(next);
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
        <h2 className="text-xl font-bold mb-2">Speed Trivia</h2>
        <p className="text-sm text-[#5F6368] mb-2">35 seconds · answer as many as you can</p>
        <p className="text-xs text-[#5F6368] mb-6 bg-[#E8F0FE] rounded-xl px-4 py-2">
          Answers are checked together when you finish or time runs out.
        </p>
        <button
          type="button"
          onClick={startGame}
          className="bg-[#1A73E8] hover:bg-[#1557B0] active:scale-95 text-white px-10 py-3 rounded-full font-bold shadow-md transition-all"
        >
          Start!
        </button>
      </div>
    );
  }

  if (phase === 'review' && review) {
    const correctCount = review.filter((item) => item.answered && item.correct).length;
    const unansweredCount = review.filter((item) => !item.answered).length;
    return (
      <div className="flex flex-col items-center w-full anim-slide-in">
        <h2 className="text-xl font-bold mb-1">Your answers</h2>
        <p className="text-sm text-[#5F6368] mb-5">
          {correctCount} correct
          {unansweredCount > 0 ? ` · ${unansweredCount} unanswered` : ''}
        </p>

        <ol className="w-full flex flex-col gap-2 mb-6">
          {review.map((item, i) => {
            const mark = !item.answered ? '—' : item.correct ? '✓' : '✗';
            const label = !item.answered ? 'No answer' : item.correct ? 'Correct' : 'Wrong';
            const markColor = !item.answered
              ? 'text-[#5F6368]'
              : item.correct
              ? 'text-[#137333]'
              : 'text-[#C5221F]';
            return (
              <li key={i} className="flex gap-3 items-start rounded-2xl border-2 border-[#DADCE0] bg-white px-4 py-3">
                <span className={`text-base font-black w-5 shrink-0 text-center ${markColor}`}>
                  <span className="sr-only">{label}: </span>
                  <span aria-hidden="true">{mark}</span>
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold text-[#202124]">
                    <span className="text-[#5F6368]">Q{i + 1}.</span> {questions[i]?.question}
                  </p>
                  {item.answered && !item.correct && picks[i] && (
                    <p className="text-xs text-[#5F6368] mt-1">Your answer: {picks[i]}</p>
                  )}
                  <p className="text-xs text-[#137333] mt-1">Correct answer: {String(item.correctAnswer)}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          onClick={finish}
          className="bg-[#1A73E8] hover:bg-[#1557B0] active:scale-95 text-white px-10 py-3 rounded-full font-bold shadow-md transition-all"
        >
          Continue
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
              className="rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95"
            >
              Try again
            </button>
          </div>
        ) : (
          <p role="status" className="text-sm font-semibold text-[#5F6368]">
            Checking your answers…
          </p>
        )}
      </div>
    );
  }

  const q = questions[idx];
  const timerPct = (timeLeft / GAME_SECS) * 100;
  const timerColor = timeLeft <= 8 ? 'text-[#EA4335] bg-[#FCE8E6]' : timeLeft <= 17 ? 'text-[#FBBC04] bg-[#FEF9E5]' : 'text-[#34A853] bg-[#E6F4EA]';

  return (
    <div className="flex flex-col items-center w-full anim-slide-in">
      <div className="w-full flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-[#5F6368]">Q{idx + 1}</span>
        <span className={`text-sm font-black px-3 py-1 rounded-full transition-colors ${timerColor}`}>
          ⏱ {timeLeft}s
        </span>
      </div>

      <div className="w-full bg-[#DADCE0] h-1.5 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-[#1A73E8] transition-all duration-1000"
          style={{ width: `${timerPct}%` }}
        />
      </div>

      <div className="w-full h-9 mb-3 flex items-center justify-center" role="status">
        {chosen !== null && (
          <span className="rounded-xl border border-[#1A73E8] bg-[#E8F0FE] px-4 py-1.5 text-xs font-bold text-[#1A73E8]">
            Locked in
          </span>
        )}
      </div>

      {q && (
        <>
          <h3 className="text-base font-bold mb-5 text-[#202124] text-center">{q.question}</h3>

          <div className="w-full flex flex-col gap-2.5">
            {q.options.map((opt) => {
              const isChosen = opt === chosen;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pickOption(opt)}
                  disabled={chosen !== null}
                  className={`w-full p-3.5 text-left text-sm font-semibold border-2 rounded-2xl transition-all active:scale-[0.98] disabled:cursor-default ${
                    chosen !== null
                      ? isChosen
                        ? 'bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8]'
                        : 'border-[#DADCE0] text-[#9AA0A6] bg-[#F8F9FA]'
                      : 'border-[#DADCE0] bg-white hover:border-[#1A73E8] hover:bg-[#E8F0FE]'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
