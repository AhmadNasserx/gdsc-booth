'use client';

import { useEffect } from 'react';
import Burst from '@/components/Burst';
import CountUp from '@/components/CountUp';
import { feedback } from '@/lib/feedback';
import { useT } from '@/lib/i18n';

const BURST_COLORS = ['#F7B500', '#965D94', '#00A6BA', '#7DB83A', '#E1484B'];

interface Props {
  name: string;
  total: number;
  /** null if the player has no score on the board. */
  rank: number | null;
}

export default function FinishScreen({ name, total, rank }: Props) {
  const { t } = useT();
  // Plays once, when the last game's finish screen appears.
  useEffect(() => {
    feedback('finish');
  }, []);

  return (
    <div className="relative overflow-hidden flex flex-col items-center text-center py-6 space-y-4">
      <Burst count={24} colors={BURST_COLORS} className="pointer-events-none" />
      <div className="relative text-5xl" aria-hidden="true">🏁</div>
      <h2 className="font-display relative text-3xl font-bold text-indigo">{t('finish.title', { name })}</h2>
      <p className="relative text-4xl font-black text-ink">
        <CountUp value={total} format={(n) => `${n} pts`} className="text-4xl font-black text-ink" />
      </p>
      {rank !== null && <p className="relative text-sm font-bold text-[#137333]">{t('finish.rank', { rank })}</p>}
      <p className="relative text-xs text-muted max-w-sm">
        {t('finish.note1')}
      </p>
      <p className="relative text-xs text-muted max-w-sm">
        {t('finish.note2')}
      </p>
      <div className="relative flex flex-col items-center gap-3 pt-3 w-full">
        <a
          href="/leaderboard"
          className="min-h-12 w-full max-w-xs inline-flex items-center justify-center px-6 py-3.5 rounded-full bg-sci hover:bg-sci-deep text-ink text-base font-extrabold shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sci/40"
        >
          {t('result.leaderboard')}
        </a>
      </div>
    </div>
  );
}
