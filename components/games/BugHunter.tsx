'use client';

import { useRef, useState } from 'react';
import type { AnswerResponse, BugView, RunResult } from '@/lib/apiTypes';

const POINTS = 40;

interface Props {
  questions: BugView[];
  act: (body: { answer: number; q: number }) => Promise<AnswerResponse>;
  onDone: (result: RunResult) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

export default function BugHunter({ questions, act, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [correctLine, setCorrectLine] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');
  const [score, setScore] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ line: number; q: number } | null>(null);
  // Set by the last answer's response; Finish reports it without another request.
  const [finalResult, setFinalResult] = useState<RunResult | null>(null);
  // Refs reject rapid repeat taps before React re-renders.
  const busyRef = useRef(false);
  const chosenRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  if (questions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[#5F6368]">No snippets this round.</p>
    );
  }

  const q = questions[idx];
  const revealed = chosen !== null;
  const correct = revealed && chosen === correctLine;
  const isLast = idx === questions.length - 1;

  async function pick(line: number, q: number) {
    if (busyRef.current || chosenRef.current !== null || finishedRef.current) return;
    busyRef.current = true;
    setSending(true);
    setError(null);
    setFailed(null);

    let res: AnswerResponse;
    try {
      res = await act({ answer: line, q });
    } catch (err) {
      busyRef.current = false;
      setSending(false);
      setFailed({ line, q });
      setError(errorMessage(err));
      return;
    }

    busyRef.current = false;
    setSending(false);
    chosenRef.current = line;
    setChosen(line);
    setCorrectLine(Number(res.correctAnswer));
    setExplanation(res.explanation ?? '');
    if (res.correct) setScore((s) => s + POINTS);
    if (res.done && res.result) setFinalResult(res.result);
  }

  function next() {
    if (chosenRef.current === null || finishedRef.current) return;
    chosenRef.current = null;
    setChosen(null);
    setCorrectLine(null);
    setExplanation('');
    setIdx((i) => i + 1);
  }

  function finish() {
    if (!finalResult || finishedRef.current) return;
    finishedRef.current = true;
    onDone(finalResult);
  }

  return (
    <div className="flex w-full min-w-0 max-w-xl flex-col mx-auto">
      <header className="mb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-base font-bold text-[#202124]">Bug Hunter</h2>
            <span
              key={`lang-${idx}`}
              className="shrink-0 rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1A73E8]"
            >
              {q.language}
            </span>
          </div>
          <span className="shrink-0 text-sm font-black tabular-nums text-[#34A853]">{score} pts</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div aria-hidden="true" className="flex items-center gap-1.5">
            {questions.map((_, i) => {
              const answered = i < idx || (i === idx && revealed);
              const cls = i === idx
                ? 'w-6 bg-[#1A73E8]'
                : answered
                  ? 'w-2 bg-[#34A853]'
                  : 'w-2 bg-[#DADCE0]';
              return <span key={i} className={`h-2 rounded-full transition-all ${cls}`} />;
            })}
          </div>
          <span className="text-xs font-bold text-[#5F6368]">
            Snippet {idx + 1} of {questions.length}
          </span>
        </div>
      </header>

      <section key={idx} className="w-full min-w-0 anim-slide-in">
        <h3 className="mb-1 text-sm font-bold text-[#202124]">{q.title}</h3>
        <p className="mb-3 text-xs text-[#5F6368]">
          {revealed ? 'Here is what went wrong:' : sending ? 'Checking…' : 'Tap the line that contains the bug.'}
        </p>

        <div className="relative">
          <div className="overflow-x-auto rounded-2xl bg-[#202124] shadow-md">
            <div className="w-max min-w-full py-2 font-mono text-sm">
              {q.lines.map((line, n) => {
                const isAnswer = revealed && n === correctLine;
                const isPick = n === chosen;
                let rowClass = 'text-[#E8EAED] hover:bg-white/10 active:bg-white/15';
                let statusText = '';
                let statusLabel = '';

                if (revealed) {
                  if (isAnswer && isPick) {
                    rowClass = 'bg-[#34A853]/25 text-[#CEEAD6]';
                    statusText = '✓ Correct';
                    statusLabel = 'your answer, correct';
                  } else if (isAnswer) {
                    rowClass = 'bg-[#34A853]/25 text-[#CEEAD6]';
                    statusText = '🐞 Bug';
                    statusLabel = 'the bug';
                  } else if (isPick) {
                    rowClass = 'bg-[#EA4335]/25 text-[#FAD2CF]';
                    statusText = '✗ Your pick';
                    statusLabel = 'your answer, wrong';
                  } else {
                    rowClass = 'text-[#9AA0A6]';
                  }
                }

                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => pick(n, idx)}
                    disabled={revealed || sending}
                    aria-label={`Line ${n + 1}: ${line.trim()}${statusLabel ? `, ${statusLabel}` : ''}`}
                    className={`flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-default ${rowClass}`}
                  >
                    <span aria-hidden="true" className="w-6 shrink-0 select-none text-right text-[#9AA0A6]">
                      {n + 1}
                    </span>
                    <span className="flex-1 whitespace-pre">{line || ' '}</span>
                    {statusText && (
                      <span aria-hidden="true" className="shrink-0 pl-2 font-sans text-[10px] font-bold uppercase tracking-wide">
                        {statusText}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {correct && (
            <span
              key="plus"
              className="anim-pop pointer-events-none absolute -top-3 right-3 text-2xl font-black text-[#34A853] drop-shadow"
            >
              +{POINTS}
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 flex flex-col items-center gap-2 rounded-2xl border-2 border-[#EA4335] bg-[#FCE8E6] px-4 py-3 text-center text-sm font-semibold text-[#C5221F]"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                if (failed) pick(failed.line, failed.q);
              }}
              disabled={sending}
              className="rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95 disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        )}

        {revealed && (
          <div
            role="status"
            className={`mt-4 rounded-2xl border-2 px-4 py-3 anim-slide-in ${
              correct
                ? 'border-[#34A853] bg-[#E6F4EA] text-[#137333]'
                : 'border-[#EA4335] bg-[#FCE8E6] text-[#C5221F]'
            }`}
          >
            <p className="text-sm font-bold">
              {correct ? `Nice catch! +${POINTS}` : `Not quite. The bug is on line ${(correctLine ?? 0) + 1}.`}
            </p>
            <p className="mt-1 text-sm text-[#202124]">{explanation}</p>
          </div>
        )}

        {revealed && (
          <button
            type="button"
            onClick={isLast ? finish : next}
            disabled={isLast && !finalResult}
            className="mt-5 w-full rounded-full bg-[#1A73E8] py-3 font-bold text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95 disabled:opacity-60"
          >
            {isLast ? 'Finish' : 'Next →'}
          </button>
        )}
      </section>
    </div>
  );
}
