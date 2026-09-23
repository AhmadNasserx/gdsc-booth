import type { LeaderboardEntry } from '@/lib/types';

const MAX_SCORE = 400;

const PODIUM = [
  {
    border: 'border-[#FBBC04]',
    bg: 'bg-gradient-to-b from-[#FFF8E1] to-white',
    bar: 'bg-[#FBBC04]',
    badge: '🥇',
    label: '1st Place',
    nameSize: 'text-2xl md:text-3xl',
    scoreSize: 'text-4xl md:text-5xl',
  },
  {
    border: 'border-[#9AA0A6]',
    bg: 'bg-gradient-to-b from-[#F1F3F4] to-white',
    bar: 'bg-[#9AA0A6]',
    badge: '🥈',
    label: '2nd Place',
    nameSize: 'text-xl md:text-2xl',
    scoreSize: 'text-3xl md:text-4xl',
  },
  {
    border: 'border-[#CD7F32]',
    bg: 'bg-gradient-to-b from-[#FFF3E0] to-white',
    bar: 'bg-[#CD7F32]',
    badge: '🥉',
    label: '3rd Place',
    nameSize: 'text-xl md:text-2xl',
    scoreSize: 'text-3xl md:text-4xl',
  },
];

function scoreColor(score: number): string {
  if (score >= 320) return 'text-[#4285F4]';
  if (score >= 240) return 'text-[#34A853]';
  if (score >= 160) return 'text-[#FBBC04]';
  return 'text-[#EA4335]';
}

function scoreBarColor(score: number): string {
  if (score >= 320) return 'bg-[#4285F4]';
  if (score >= 240) return 'bg-[#34A853]';
  if (score >= 160) return 'bg-[#FBBC04]';
  return 'bg-[#EA4335]';
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
      {/* Podium */}
      <div className="grid grid-cols-3 gap-3 md:gap-5 mb-6 md:mb-8">
        {top3.map((entry, i) => {
          const p = PODIUM[i];
          const pct = Math.min(100, Math.round((entry.score / MAX_SCORE) * 100));
          return (
            <div
              key={`${entry.name}-${entry.timestamp}`}
              className={`rounded-3xl border-2 ${p.border} ${p.bg} p-4 md:p-6 text-center shadow-sm flex flex-col items-center`}
            >
              <span className="text-4xl md:text-5xl mb-1">{p.badge}</span>
              <span className="text-xs font-bold text-[#5F6368] uppercase tracking-widest mb-2">
                {p.label}
              </span>
              <span className={`${p.nameSize} font-extrabold text-[#202124] mb-3 w-full truncate`}>
                {entry.name}
              </span>
              <span className={`${p.scoreSize} font-black ${scoreColor(entry.score)} mb-3 leading-none`}>
                {entry.score}
              </span>
              <div className="w-full bg-[#E8EAED] rounded-full h-2.5 md:h-3">
                <div
                  className={`h-2.5 md:h-3 rounded-full ${p.bar} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-[#9AA0A6] mt-1.5">{entry.score} / {MAX_SCORE}</span>
            </div>
          );
        })}
      </div>

      {/* Remaining entries */}
      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((entry, i) => {
            const rank = i + 4;
            const pct = Math.min(100, Math.round((entry.score / MAX_SCORE) * 100));
            return (
              <div
                key={`${entry.name}-${entry.timestamp}`}
                className="flex items-center gap-3 md:gap-5 bg-[#F8F9FA] rounded-2xl px-4 md:px-6 py-3"
              >
                <span className="w-8 text-base md:text-lg font-black text-[#9AA0A6] text-center shrink-0">
                  #{rank}
                </span>
                <span className="flex-1 text-base md:text-lg font-semibold text-[#202124] truncate">
                  {entry.name}
                </span>
                <div className="hidden sm:block flex-1 max-w-[160px] bg-[#E8EAED] rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${scoreBarColor(entry.score)} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={`text-base md:text-lg font-black w-12 text-right shrink-0 ${scoreColor(entry.score)}`}>
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
