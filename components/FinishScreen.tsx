'use client';

interface Props {
  name: string;
  total: number;
  /** null if the player has no score on the board. */
  rank: number | null;
}

export default function FinishScreen({ name, total, rank }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-6 space-y-4">
      <div className="text-5xl" aria-hidden="true">🏁</div>
      <h2 className="text-2xl font-extrabold text-[#202124]">That&apos;s all three games, {name}!</h2>
      <p className="text-4xl font-black text-[#1A73E8]">{`${total} pts`}</p>
      {rank !== null && <p className="text-sm font-bold text-[#137333]">{`You're #${rank} on the leaderboard`}</p>}
      <p className="text-xs text-[#5F6368] max-w-sm">
        Each game can be played once. The player at the top of the leaderboard at the end of the day wins the prize.
      </p>
      <div className="flex flex-col items-center gap-3 pt-3 w-full">
        <a
          href="/leaderboard"
          className="min-h-12 w-full max-w-xs inline-flex items-center justify-center px-6 py-3.5 rounded-full bg-[#1A73E8] hover:bg-[#1557B0] text-white text-base font-extrabold shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1A73E8]/40"
        >
          View leaderboard
        </a>
        <a
          href="https://forms.gle/N5UBuhErH9wqjpV87"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-12 w-full max-w-xs inline-flex items-center justify-center px-6 py-3.5 rounded-full bg-[#34A853] hover:bg-[#2C8E45] text-white text-base font-extrabold shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#34A853]/40"
        >
          Join GDSC →
        </a>
      </div>
    </div>
  );
}
