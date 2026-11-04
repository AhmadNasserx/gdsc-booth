import type { LeaderboardEntry } from '@/lib/types';
import { TABS, type Tab } from '@/lib/types';
import { GAMES } from '@/lib/games';

// One neutral brand colour for every score, so no score reads as "good" or "bad".
const SCORE_TEXT = 'text-ink';

const PODIUM = [
  {
    border: 'border-sci',
    bg: 'bg-gradient-to-b from-sci-soft to-white',
    badge: '🥇',
    label: '1st Place',
    // full-width on mobile → can afford larger text
    nameSize: 'text-xl sm:text-2xl md:text-3xl',
    scoreSize: 'text-3xl sm:text-4xl md:text-5xl',
  },
  {
    border: 'border-muted-2',
    bg: 'bg-gradient-to-b from-mist-2 to-white',
    badge: '🥈',
    label: '2nd Place',
    nameSize: 'text-sm sm:text-xl md:text-2xl',
    scoreSize: 'text-xl sm:text-3xl md:text-4xl',
  },
  {
    border: 'border-[#E8935A]',
    bg: 'bg-gradient-to-b from-[#FDEBE3] to-white',
    badge: '🥉',
    label: '3rd Place',
    nameSize: 'text-sm sm:text-xl md:text-2xl',
    scoreSize: 'text-xl sm:text-3xl md:text-4xl',
  },
];

/** Highest score first; on a tie, whoever reached their total first. */
export function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || a.timestamp - b.timestamp);
}

// One small emoji per game the player has a score in. Older entries may have no games.
function GameChips({ games }: { games?: LeaderboardEntry['games'] }) {
  const played = TABS.filter((tab: Tab) => typeof games?.[tab] === 'number');
  if (played.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center justify-center gap-1">
      {played.map((tab) => (
        <span
          key={tab}
          role="img"
          aria-label={GAMES[tab].title}
          title={GAMES[tab].title}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-mist-2 text-xs leading-none"
        >
          {GAMES[tab].emoji}
        </span>
      ))}
    </span>
  );
}

// Shown beside players who have not finished all three games yet. They are not in any hourly top 3.
function StillPlaying({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-sci-soft px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-sci-ink whitespace-nowrap shrink-0 ${className}`}
    >
      Still playing
    </span>
  );
}

interface Props { entries: LeaderboardEntry[]; }

export default function LeaderboardTable({ entries }: Props) {
  const sorted = sortEntries(entries);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <p className="text-2xl md:text-3xl font-semibold text-muted">No scores yet</p>
        <p className="text-base text-muted-2 mt-2">Be the first to play!</p>
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
              <span className="font-display text-xs font-semibold text-sci-ink uppercase tracking-widest mb-1.5">
                {p.label}
              </span>
              <span className={`${p.nameSize} font-extrabold text-ink mb-1 w-full truncate min-w-0`}>
                {entry.name}
              </span>
              {typeof entry.finishedAt !== 'number' && <StillPlaying className="mb-1.5" />}
              <span className="mb-2">
                <GameChips games={entry.games} />
              </span>
              <span className={`${p.scoreSize} font-display font-bold tabular-nums ${SCORE_TEXT} leading-none`}>
                {entry.score}
              </span>
              <span className="text-[10px] font-semibold text-muted mt-1">pts</span>
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
                className="flex items-center gap-2.5 md:gap-5 bg-white border border-line rounded-2xl px-3 md:px-6 py-3 shadow-sm"
              >
                <span className="font-display w-8 md:w-10 text-base md:text-xl font-bold text-plum text-center shrink-0">
                  #{rank}
                </span>
                <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span className="truncate min-w-0 text-sm md:text-lg font-semibold text-ink">{entry.name}</span>
                  {typeof entry.finishedAt !== 'number' && <StillPlaying />}
                  <GameChips games={entry.games} />
                </span>
                <span className={`font-display text-base md:text-xl font-bold tabular-nums text-right shrink-0 whitespace-nowrap ${SCORE_TEXT}`}>
                  {entry.score} <span className="text-xs font-semibold text-muted">pts</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
