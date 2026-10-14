import type { LeaderboardEntry, Tab } from '@/lib/types';
import { GAMES } from '@/lib/games';

// One neutral brand colour for every score, so no score reads as "good" or "bad".
const SCORE_TEXT = 'text-[#1A73E8]';

const PODIUM = [
  {
    border: 'border-[#FBBC04]',
    bg: 'bg-gradient-to-b from-[#FFF8E1] to-white',
    badge: '🥇',
    label: '1st Place',
    // full-width on mobile → can afford larger text
    nameSize: 'text-xl sm:text-2xl md:text-3xl',
    scoreSize: 'text-3xl sm:text-4xl md:text-5xl',
  },
  {
    border: 'border-[#9AA0A6]',
    bg: 'bg-gradient-to-b from-[#F1F3F4] to-white',
    badge: '🥈',
    label: '2nd Place',
    nameSize: 'text-sm sm:text-xl md:text-2xl',
    scoreSize: 'text-xl sm:text-3xl md:text-4xl',
  },
  {
    border: 'border-[#CD7F32]',
    bg: 'bg-gradient-to-b from-[#FFF3E0] to-white',
    badge: '🥉',
    label: '3rd Place',
    nameSize: 'text-sm sm:text-xl md:text-2xl',
    scoreSize: 'text-xl sm:text-3xl md:text-4xl',
  },
];

// Small emoji for the game an entry was scored in. Older entries have no game.
function GameBadge({ game }: { game?: Tab }) {
  const meta = game ? GAMES[game] : undefined;
  if (!meta) return null;
  return (
    <span role="img" aria-label={meta.title} title={meta.title} className="shrink-0 leading-none">
      {meta.emoji}
    </span>
  );
}

interface Props { entries: LeaderboardEntry[]; }

export default function LeaderboardTable({ entries }: Props) {
  const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, 20);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-2xl md:text-3xl font-semibold text-[#5F6368]">No scores yet</p>
        <p className="text-base text-[#9AA0A6] mt-2">Be the first to play!</p>
      </div>
    );
  }

  const top3 = sorted.slice(0, Math.min(3, sorted.length));
  const rest = sorted.slice(3);

  return (
    <div>
      {/*
        Mobile: 2-col grid — 1st place spans both columns (full width),
                              2nd and 3rd fill one column each beneath it.
        sm+:    3-col grid — equal columns as before.
      */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-5 mb-6 md:mb-8">
        {top3.map((entry, i) => {
          const p = PODIUM[i];
          return (
            <div
              key={`${entry.name}-${entry.timestamp}`}
              className={`${i === 0 ? 'col-span-2 sm:col-span-1' : ''} rounded-3xl border-2 ${p.border} ${p.bg} p-3 sm:p-4 md:p-6 text-center shadow-sm flex flex-col items-center`}
            >
              <span className="text-3xl sm:text-4xl md:text-5xl mb-1">{p.badge}</span>
              <span className="text-[10px] font-bold text-[#5F6368] uppercase tracking-widest mb-1.5">
                {p.label}
              </span>
              <span className={`${p.nameSize} font-extrabold text-[#202124] mb-2 w-full flex items-center justify-center gap-2 min-w-0`}>
                <GameBadge game={entry.game} />
                <span className="truncate min-w-0">{entry.name}</span>
              </span>
              <span className={`${p.scoreSize} font-black ${SCORE_TEXT} leading-none`}>
                {entry.score}
              </span>
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((entry, i) => {
            const rank = i + 4;
            return (
              <div
                key={`${entry.name}-${entry.timestamp}`}
                className="flex items-center gap-2.5 md:gap-5 bg-white rounded-2xl px-3 md:px-6 py-3 shadow-sm"
              >
                <span className="w-7 md:w-8 text-sm md:text-lg font-black text-[#9AA0A6] text-center shrink-0">
                  #{rank}
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-2 text-sm md:text-lg font-semibold text-[#202124]">
                  <GameBadge game={entry.game} />
                  <span className="truncate min-w-0">{entry.name}</span>
                </span>
                <span className={`text-sm md:text-lg font-black w-9 md:w-12 text-right shrink-0 ${SCORE_TEXT}`}>
                  {entry.score}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
