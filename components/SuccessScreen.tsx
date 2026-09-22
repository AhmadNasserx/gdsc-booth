interface Props { name: string; total: number; rank: number; }

export default function SuccessScreen({ name, total, rank }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-8 space-y-4">
      <div className="text-5xl">🏆</div>
      <h2 className="text-2xl font-extrabold text-[#202124]">Well done, {name}!</h2>
      <p className="text-4xl font-black text-[#1A73E8]">{total} <span className="text-xl font-semibold text-[#5F6368]">/ 400 pts</span></p>
      <p className="text-sm font-bold text-[#34A853]">You are #{rank} on the leaderboard!</p>
      <a
        href="https://forms.gle/PLACEHOLDER"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 bg-[#34A853] hover:bg-[#2C8E45] text-white font-bold px-8 py-3 rounded-full text-sm transition-all shadow"
      >
        Join GDSC →
      </a>
      <a href="/leaderboard" className="text-xs text-[#1A73E8] underline">View Live Leaderboard</a>
    </div>
  );
}
