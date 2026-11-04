'use client';

import { useEffect } from 'react';
import Burst from '@/components/Burst';
import CountUp from '@/components/CountUp';
import type { RunResult } from '@/lib/apiTypes';
import { feedback } from '@/lib/feedback';
import { GAMES } from '@/lib/games';
import { GAME_TEXT, useT } from '@/lib/i18n';
import type { Tab } from '@/lib/types';

// Pure CSS confetti. Positions are fixed so server and client render the same markup.
const CONFETTI_COLORS = ['#F7B500', '#965D94', '#00A6BA', '#7DB83A', '#E1484B'];
const CONFETTI = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 8) * 0.15,
  duration: 2.4 + (i % 5) * 0.3,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

interface Props {
  /** The game that was just finished. */
  game: Tab;
  result: RunResult;
  /** The next game in order, or null when this was the last one. */
  nextGame: Tab | null;
  onNextGame: () => void;
}

const buttonBase =
  'min-h-12 w-full max-w-xs px-6 py-3.5 rounded-full text-base font-extrabold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sci/40 disabled:opacity-60';

export default function ResultScreen({ game, result, nextGame, onNextGame }: Props) {
  const meta = GAMES[game];
  const { lang, t } = useT();
  const title = (tab: Tab) => (lang === 'fr' ? GAME_TEXT.fr[tab].title : GAMES[tab].title);

  // Sound plays once, when the screen appears. The screen mounts once per result, so the
  // result is read only on mount and later prop changes do not replay the sound.
  useEffect(() => {
    feedback(result.improved ? 'win' : 'finish');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative overflow-hidden flex flex-col items-center text-center py-6 space-y-4">
      {result.improved && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {CONFETTI.map((piece, i) => (
            <span
              key={i}
              className="anim-confetti absolute top-0 block w-2 h-3 rounded-sm"
              style={{
                left: `${piece.left}%`,
                background: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      {result.improved && (
        <Burst count={16} colors={CONFETTI_COLORS} className="pointer-events-none" />
      )}

      <div className="relative text-5xl" aria-hidden="true">{result.improved ? '🏆' : '✅'}</div>
      <h2 className="font-display relative text-4xl font-bold text-indigo">{t('result.done')}</h2>
      <p className="relative text-sm font-semibold text-muted">
        <span aria-hidden="true" className="font-emoji">{meta.emoji}</span> {title(game)}
      </p>

      <p className="relative text-4xl font-black text-ink">
        <CountUp
          value={result.score}
          format={(n) => `+${n} pts`}
          className="relative text-4xl font-black text-ink"
        />
      </p>

      <p className="relative text-sm font-bold text-[#137333]">
        {t('result.total', { total: result.total, rank: result.rank })}
      </p>

      <div className="relative flex flex-col items-center gap-3 pt-3 w-full">
        <button
          type="button"
          onClick={onNextGame}
          className={`${buttonBase} bg-sci hover:bg-sci-deep text-ink shadow`}
        >
          {nextGame ? t('result.next', { game: title(nextGame) }) : t('result.see')}
        </button>

        <a
          href="/leaderboard"
          className="min-h-11 inline-flex items-center px-4 text-sm font-semibold text-ink underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sci rounded"
        >
          {t('result.leaderboard')}
        </a>
      </div>
    </div>
  );
}
