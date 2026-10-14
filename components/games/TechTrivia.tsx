'use client';

import { useState, useEffect, useRef } from 'react';
import type { AnswerResponse, FinishResponse, RunResult, TriviaView } from '@/lib/apiTypes';

const GAME_SECS = 35;
const CORRECT_PTS = 20;
const WRONG_PENALTY = 10;
const CORRECT_DELAY_MS = 600;
const WRONG_LOCKOUT_MS = 1500;

type TriviaBody = { answer: string; q: number } | { finish: true };

interface Props {
  questions: TriviaView[];
  act: (body: TriviaBody) => Promise<AnswerResponse | FinishResponse>;
  onDone: (result: RunResult) => void;
}

function isAnswer(res: AnswerResponse | FinishResponse): res is AnswerResponse {
  return 'correct' in res;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.';
}

export default function TechTrivia({ questions, act, onDone }: Props) {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_SECS);
  const [timeUp, setTimeUp] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<TriviaBody | null>(null);
  // Refs hold the guards that async callbacks and timers read, where state would be stale.
  const busyRef = useRef(false);
  const chosenRef = useRef<string | null>(null);
  const timeLeftRef = useRef(GAME_SECS);
  const timeUpRef = useRef(false);
  const doneRef = useRef(false);
  const resultRef = useRef<RunResult | null>(null);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
  }, []);

  function finalise(result: RunResult) {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(result);
  }

  async function requestFinish() {
    if (doneRef.current) return;
    if (resultRef.current) {
      finalise(resultRef.current);
      return;
    }
    // An answer is still in flight; it calls requestFinish again when it settles.
    if (busyRef.current) return;

    busyRef.current = true;
    setSending(true);
    setError(null);
    setFailed(null);

    let res: AnswerResponse | FinishResponse;
    try {
      res = await act({ finish: true });
    } catch (err) {
      busyRef.current = false;
      setSending(false);
      setFailed({ finish: true });
      setError(errorMessage(err));
      return;
    }

    busyRef.current = false;
    setSending(false);
    if (res.result) {
      finalise(res.result);
    } else {
      setFailed({ finish: true });
      setError('Could not finish the game. Please try again.');
    }
  }

  async function submitAnswer(opt: string, q: number) {
    if (busyRef.current || doneRef.current || timeUpRef.current || chosenRef.current !== null) return;
    busyRef.current = true;
    setSending(true);
    setError(null);
    setFailed(null);

    let res: AnswerResponse;
    try {
      const raw = await act({ answer: opt, q });
      if (!isAnswer(raw)) throw new Error('Unexpected response from the server.');
      res = raw;
    } catch (err) {
      busyRef.current = false;
      setSending(false);
      // Time ran out while this request was in flight: the question counts as unanswered.
      if (timeUpRef.current) {
        requestFinish();
        return;
      }
      setFailed({ answer: opt, q });
      setError(errorMessage(err));
      return;
    }

    busyRef.current = false;
    setSending(false);
    if (res.done && res.result) resultRef.current = res.result;
    if (timeUpRef.current) {
      requestFinish();
      return;
    }

    const { correct } = res;
    chosenRef.current = opt;
    setChosen(opt);
    setCorrectAnswer(String(res.correctAnswer));
    setScore((s) => (correct ? s + CORRECT_PTS : Math.max(0, s - WRONG_PENALTY)));
    scheduleAdvance(!correct);
  }

  function scheduleAdvance(isWrong: boolean) {
    advanceRef.current = setTimeout(() => {
      advanceRef.current = null;
      if (doneRef.current) return;
      if (resultRef.current) {
        finalise(resultRef.current);
        return;
      }
      if (timeUpRef.current) return; // requestFinish has taken over
      chosenRef.current = null;
      setChosen(null);
      setCorrectAnswer(null);
      setIdx((i) => i + 1);
    }, isWrong ? WRONG_LOCKOUT_MS : CORRECT_DELAY_MS);
  }

  function expire() {
    timeUpRef.current = true;
    setTimeUp(true);
    requestFinish();
  }

  useEffect(() => {
    if (!active || timeUp) return;
    const id = setTimeout(() => {
      const next = timeLeftRef.current - 1;
      timeLeftRef.current = next;
      setTimeLeft(next);
      if (next <= 0) expire();
    }, 1000);
    return () => clearTimeout(id);
    // expire and requestFinish read only refs and state setters, so the tick effect deliberately ignores them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, timeLeft, timeUp]);

  function startGame() {
    setActive(true);
  }

  function retry() {
    if (!failed) return;
    if ('finish' in failed) requestFinish();
    else submitAnswer(failed.answer, failed.q);
  }

  if (!active) {
    return (
      <div className="flex flex-col items-center text-center py-8 anim-slide-in">
        <div className="text-5xl mb-4">⚡</div>
        <h2 className="text-xl font-bold mb-2">Speed Trivia</h2>
        <p className="text-sm text-[#5F6368] mb-2">35 seconds · answer as many as you can</p>
        <p className="text-xs text-[#5F6368] mb-6 bg-[#E8F0FE] rounded-xl px-4 py-2">
          Correct → +{CORRECT_PTS} pts · Wrong → −{WRONG_PENALTY} pts + {WRONG_LOCKOUT_MS / 1000}s wait
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

  const q = questions[idx];
  const timerPct = (timeLeft / GAME_SECS) * 100;
  const timerColor = timeLeft <= 8 ? 'text-[#EA4335] bg-[#FCE8E6]' : timeLeft <= 17 ? 'text-[#FBBC04] bg-[#FEF9E5]' : 'text-[#34A853] bg-[#E6F4EA]';
  const revealed = chosen !== null;
  const wrong = revealed && chosen !== correctAnswer;

  return (
    <div className="flex flex-col items-center w-full anim-slide-in">
      <div className="w-full flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-[#5F6368]">
          Q{idx + 1} · <span className="text-[#1A73E8]">{score} pts</span>
        </span>
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

      {timeUp ? (
        !error && (
          <div className="w-full bg-[#FEF9E5] border border-[#FBBC04] rounded-xl px-4 py-2 mb-3 text-center text-xs font-bold text-[#B06000]">
            Time&apos;s up! Locking in your score…
          </div>
        )
      ) : (
        wrong && (
          <div className="w-full bg-[#FCE8E6] border border-[#EA4335] rounded-xl px-4 py-2 mb-3 text-center text-xs font-bold text-[#C5221F]">
            Wrong! −{WRONG_PENALTY} pts · Next question in {WRONG_LOCKOUT_MS / 1000}s…
          </div>
        )
      )}

      {q && (
        <>
          <h3 className="text-base font-bold mb-5 text-[#202124] text-center">{q.question}</h3>

          <div className="w-full flex flex-col gap-2.5">
            {q.options.map((opt) => {
              const isCorrect = revealed && opt === correctAnswer;
              const isChosen = opt === chosen;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => submitAnswer(opt, idx)}
                  disabled={revealed || sending || timeUp}
                  className={`w-full p-3.5 text-left text-sm font-semibold border-2 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60 ${
                    revealed
                      ? isCorrect
                        ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333]'
                        : isChosen
                        ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                        : 'border-[#DADCE0] text-[#9AA0A6] bg-[#F8F9FA]'
                      : 'border-[#DADCE0] bg-white hover:border-[#1A73E8] hover:bg-[#E8F0FE]'
                  }`}
                >
                  {revealed && isCorrect ? '✓ ' : revealed && isChosen && !isCorrect ? '✗ ' : ''}{opt}
                </button>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-[#EA4335] bg-[#FCE8E6] px-4 py-3 text-sm font-semibold text-[#C5221F]"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={retry}
            disabled={sending}
            className="rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#1557B0] active:scale-95 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
