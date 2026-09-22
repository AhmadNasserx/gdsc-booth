import type { LeaderboardEntry } from '@/lib/types';

const RANK_STYLES = ['text-[#4285F4]', 'text-[#EA4335]', 'text-[#FBBC04]'];
const RANK_MEDALS = ['🥇', '🥈', '🥉'];

interface Props { entries: LeaderboardEntry[]; }

export default function LeaderboardTable({ entries }: Props) {
  const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, 20);

  if (sorted.length === 0) {
    return <p className="text-center text-[#5F6368] py-8">No scores yet — be the first!</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#DADCE0]">
          <th className="py-3 text-left font-bold text-[#5F6368] w-12">Rank</th>
          <th className="py-3 text-left font-bold text-[#5F6368]">Name</th>
          <th className="py-3 text-right font-bold text-[#5F6368]">Score</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((entry, i) => (
          <tr key={`${entry.name}-${entry.timestamp}`} className="border-b border-[#F8F9FA]">
            <td className={`py-3 font-black text-lg ${RANK_STYLES[i] ?? 'text-[#202124]'}`}>
              {RANK_MEDALS[i] ?? `#${i + 1}`}
            </td>
            <td className="py-3 font-semibold text-[#202124]">{entry.name}</td>
            <td className="py-3 text-right font-bold text-[#1A73E8]">{entry.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
