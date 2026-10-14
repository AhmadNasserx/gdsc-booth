'use client';

import { useState, useRef, useEffect } from 'react';
import type { AnswerResponse, RiddleView, RunResult } from '@/lib/apiTypes';

const POINTS = 40;
const FEEDBACK_MS = 1100;

interface Props {
  questions: RiddleView[];
  act: (body: { answer: string }) => Promise<AnswerResponse>;
  onDone: (result: RunResult) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

export default function EmojiRiddles({ questions, act, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedOpt, setFailedOpt] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [animType, setAnimType] = useState<'pop' | 'shake' | null>(null);
  // Refs block double taps before React re-renders; doneRef keeps onDone to one call.
  const busyRef = useRef(false);
  const chosenRef = useRef<string | null>(null);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function submit(opt: string) {
    if (busyRef.current || doneRef.current || chosenRef.current !== null) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setFailedOpt(null);

    let res: AnswerResponse;
    try {
      res = await act({ answer: opt });
    } catch (err) {
      busyRef.current = false;
      setBusy(false);
      setFailedOpt(opt);
      setError(errorMessage(err));
      return;
    }

    busyRef.current = false;
    setBusy(false);
    chosenRef.current = opt;
    setChosen(opt);
    setCorrectAnswer(String(res.correctAnswer));
    setAnimType(res.correct ? 'pop' : 'shake');
    setAnimKey((k) => k + 1);
    if (res.correct) setScore((s) => s + POINTS);

    const { done, result } = res;
    timerRef.current = setTimeout(() => {
      setAnimType(null);
      if (done) {
        if (result && !doneRef.current) {
          doneRef.current = true;
          onDone(result);
        }
        return;
      }
      chosenRef.current = null;
      setChosen(null);
      setCorrectAnswer(null);
      setIdx((i) => i + 1);
    }, FEEDBACK_MS);
  }

  const riddle = questions[idx];
  const revealed = chosen !== null;

  return (
    <div
      key={animKey}
      className={`flex flex-col items-center text-center ${animType === 'pop' ? 'anim-pop' : animType === 'shake' ? 'anim-shake' : ''}`}
    >
      <div className="flex items-center justify-between w-full mb-4">
        <span className="text-xs font-bold text-[#1A73E8] uppercase tracking-wider bg-[#E8F0FE] px-3 py-1 rounded-full">
          Question {idx + 1} of {questions.length}
        </span>
        <span className="text-xs font-bold text-[#34A853]">{score} pts</span>
      </div>

      <div className="text-6xl my-4 tracking-widest">{riddle.emojis}</div>
      <p className="text-sm text-[#5F6368] mb-6 italic">Hint: {riddle.hint}</p>

      <div className="w-full grid grid-cols-2 gap-3 mb-2">
        {riddle.options.map((opt) => {
          const isCorrect = revealed && opt === correctAnswer;
          const isChosen = opt === chosen;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => submit(opt)}
              disabled={busy || revealed}
              className={`p-4 text-sm font-semibold rounded-2xl border-2 transition-all duration-150 disabled:opacity-60 ${
                revealed
                  ? isCorrect
                    ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333]'
                    : isChosen
                    ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                    : 'border-[#DADCE0] text-[#9AA0A6] bg-[#F8F9FA]'
                  : 'border-[#DADCE0] bg-white hover:border-[#1A73E8] hover:bg-[#E8F0FE] active:scale-95'
              }`}
            >
              {revealed && isCorrect ? '✓ ' : revealed && isChosen ? '✗ ' : ''}{opt}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-[#EA4335] bg-[#FCE8E6] px-4 py-3 text-sm font-semibold text-[#C5221F]"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              if (failedOpt !== null) submit(failedOpt);
            }}
            disabled={busy}
            className="rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
