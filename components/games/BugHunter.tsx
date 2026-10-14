'use client';

import { useEffect, useRef, useState } from 'react';
import type { BatchResponse, BugView, ReviewItem, RunResult } from '@/lib/apiTypes';

// Short neutral "locked in" pause before the next snippet. No network involved.
const PICK_MS = 250;

type Phase = 'play' | 'checking' | 'error' | 'review';

interface Props {
  questions: BugView[];
  act: (body: { answers: (number | null)[] }) => Promise<BatchResponse>;
  onDone: (result: RunResult) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

export default function BugHunter({ questions, act, onDone }: Props) {
  const [idx, setIdx] = useState(0);
  // Line locked in for the current snippet, shown neutrally until the transition ends.
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [phase, setPhase] = useState<Phase>('play');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [finalResult, setFinalResult] = useState<RunResult | null>(null);

  // Refs hold the source of truth for guards and retries, so taps and retries never see stale state.
  const answersRef = useRef<(number | null)[]>(questions.map(() => null));
  const lockedRef = useRef(false);
  const inFlightRef = useRef(false);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (questions.length === 0) {
    return <p className="py-8 text-center text-sm text-[#5F6368]">No snippets this round.</p>;
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
      setError(errorMessage(err));
      setPhase('error');
      return;
    }

    inFlightRef.current = false;
    setReview(res.results);
    setFinalResult(res.result);
    setPhase('review');
  }

  function pick(line: number) {
    if (lockedRef.current) return;
    lockedRef.current = true;

    const next = answersRef.current.slice();
    next[idx] = line;
    answersRef.current = next;
    setAnswers(next);
    setPicked(line);

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

  const header = (
    <header className="mb-3 flex items-center justify-between gap-2">
      <h2 className="truncate text-base font-bold text-[#202124]">Bug Hunter</h2>
      {phase === 'play' && (
        <span className="shrink-0 text-xs font-bold text-[#5F6368]">
          Snippet {idx + 1} of {questions.length}
        </span>
      )}
    </header>
  );

  if (phase === 'review') {
    return (
      <div className="flex w-full min-w-0 max-w-xl flex-col mx-auto">
        {header}
        <section aria-labelledby="bug-review-heading" className="w-full min-w-0 anim-slide-in">
          <h3 id="bug-review-heading" className="mb-4 text-center text-lg font-black text-[#202124]">
            Your answers
          </h3>
          <ol className="flex flex-col gap-4">
            {questions.map((snippet, i) => {
              const item = review[i];
              const answered = item?.answered === true;
              const correct = answered && item.correct;
              const bugLine = item ? Number(item.correctAnswer) : -1;
              const yourPick = answers[i];
              const mark = !answered ? '—' : correct ? '✓' : '✗';
              const label = !answered ? 'Unanswered' : correct ? 'Correct' : 'Incorrect';
              const tone = !answered
                ? 'border-[#DADCE0]'
                : correct
                  ? 'border-[#34A853]'
                  : 'border-[#EA4335]';
              return (
                <li key={i} className={`min-w-0 rounded-2xl border-2 bg-white p-4 ${tone}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span aria-hidden="true" className="shrink-0 text-lg font-black text-[#202124]">
                      {mark}
                    </span>
                    <span className="sr-only">{label}</span>
                    <h4 className="min-w-0 flex-1 truncate text-sm font-bold text-[#202124]">{snippet.title}</h4>
                    <span className="shrink-0 rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1A73E8]">
                      {snippet.language}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl bg-[#202124]">
                    <div className="w-max min-w-full py-2 font-mono text-xs">
                      {snippet.lines.map((text, n) => {
                        const isBug = n === bugLine;
                        const isPick = n === yourPick;
                        let rowClass = 'text-[#9AA0A6]';
                        let note = '';
                        if (isBug && isPick) {
                          rowClass = 'bg-[#34A853]/25 text-[#CEEAD6]';
                          note = '🐞 Bug · ✓ Your pick';
                        } else if (isBug) {
                          rowClass = 'bg-[#34A853]/25 text-[#CEEAD6]';
                          note = '🐞 Bug';
                        } else if (isPick) {
                          rowClass = 'bg-[#EA4335]/25 text-[#FAD2CF]';
                          note = '✗ Your pick';
                        } else {
                          rowClass = 'text-[#E8EAED]';
                        }
                        return (
                          <div key={n} className={`flex items-center gap-3 px-3 py-1 ${rowClass}`}>
                            <span className="w-5 shrink-0 select-none text-right text-[#9AA0A6]">{n + 1}</span>
                            <span className="flex-1 whitespace-pre">{text || ' '}</span>
                            {note && (
                              <span className="shrink-0 pl-2 font-sans text-[10px] font-bold uppercase tracking-wide">
                                {note}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!answered || !correct ? (
                    <p className="mt-2 text-xs font-semibold text-[#5F6368]">
                      {yourPick === null ? 'No answer.' : `Your pick: line ${yourPick + 1}.`}{' '}
                      The bug is on line {bugLine + 1}.
                    </p>
                  ) : null}
                  {item?.explanation && <p className="mt-1 text-sm text-[#202124]">{item.explanation}</p>}
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
      </div>
    );
  }

  if (phase === 'checking' || phase === 'error') {
    return (
      <div className="flex w-full min-w-0 max-w-xl flex-col mx-auto">
        {header}
        <div className="flex w-full flex-col items-center gap-4 py-10 text-center anim-slide-in">
          {phase === 'checking' ? (
            <p role="status" className="text-sm font-bold text-[#5F6368]">
              Checking your answers…
            </p>
          ) : (
            <div
              role="alert"
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-[#EA4335] bg-[#FCE8E6] px-4 py-3 text-center text-sm font-semibold text-[#C5221F]"
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
      </div>
    );
  }

  const q = questions[idx];

  return (
    <div className="flex w-full min-w-0 max-w-xl flex-col mx-auto">
      {header}
      <div className="mb-3 flex items-center gap-1.5" aria-hidden="true">
        {questions.map((_, i) => {
          const answered = i < idx || (i === idx && picked !== null);
          const cls = i === idx ? 'w-6 bg-[#1A73E8]' : answered ? 'w-2 bg-[#8AB4F8]' : 'w-2 bg-[#DADCE0]';
          return <span key={i} className={`h-2 rounded-full transition-all ${cls}`} />;
        })}
      </div>

      <section key={idx} className="w-full min-w-0 anim-slide-in">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#202124]">{q.title}</h3>
          <span className="shrink-0 rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1A73E8]">
            {q.language}
          </span>
        </div>
        <p className="mb-3 text-xs text-[#5F6368]">Tap the line that contains the bug.</p>

        <div className="overflow-x-auto rounded-2xl bg-[#202124] shadow-md">
          <div className="w-max min-w-full py-2 font-mono text-sm">
            {q.lines.map((line, n) => {
              const isPicked = picked === n;
              const dimmed = picked !== null && !isPicked;
              let rowClass = 'text-[#E8EAED] hover:bg-white/10 active:bg-white/15';
              if (isPicked) rowClass = 'bg-white/15 text-white ring-2 ring-inset ring-[#8AB4F8]';
              else if (dimmed) rowClass = 'text-[#9AA0A6]';

              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(n)}
                  disabled={picked !== null}
                  aria-label={`Line ${n + 1}: ${line.trim()}${isPicked ? ', selected' : ''}`}
                  className={`flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-default ${rowClass}`}
                >
                  <span aria-hidden="true" className="w-6 shrink-0 select-none text-right text-[#9AA0A6]">
                    {n + 1}
                  </span>
                  <span className="flex-1 whitespace-pre">{line || ' '}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
