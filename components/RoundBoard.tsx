import type { RoundResult, RoundTop } from '@/lib/apiTypes';

const MEDALS = ['🥇', '🥈', '🥉'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Countdown as MM:SS. Whole seconds only; a negative or missing time reads as 00:00. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

/** Local clock time in 24-hour form, e.g. 14:05. */
function clock(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The round window, e.g. "Round 3 · 14:00–15:00". */
function roundLabel(round: RoundResult): string {
  return `Round ${round.round} · ${clock(round.start)}–${clock(round.end)}`;
}

/** The top three finishers of a round, best rank first. */
function topThree(round: RoundResult | undefined): RoundTop[] {
  if (!round) return [];
  return [...round.top].sort((a, b) => a.rank - b.rank).slice(0, 3);
}

interface TextSize { medal: string; name: string; score: string; }

const LARGE: TextSize = {
  medal: 'text-3xl md:text-4xl',
  name: 'text-xl md:text-3xl',
  score: 'text-xl md:text-3xl',
};

const SMALL: TextSize = {
  medal: 'text-xl md:text-2xl',
  name: 'text-base md:text-lg',
  score: 'text-base md:text-lg',
};

function TopRow({ entry, size }: { entry: RoundTop; size: TextSize }) {
  return (
    <li className="flex items-center gap-3 min-w-0">
      <span className={`${size.medal} leading-none shrink-0`}>{MEDALS[entry.rank - 1]}</span>
      <span className={`${size.name} flex-1 min-w-0 truncate font-semibold text-ink`}>
        {entry.name}
      </span>
      <span className={`${size.score} shrink-0 whitespace-nowrap font-black tabular-nums text-ink`}>
        {`${entry.score} pts`}
      </span>
    </li>
  );
}

function WaitingRow({ rank, size }: { rank: number; size: TextSize }) {
  return (
    <li className="flex items-center gap-3 min-w-0">
      <span className={`${size.medal} leading-none shrink-0 opacity-40`}>{MEDALS[rank - 1]}</span>
      <span className={`${size.name} text-muted-2`}>Waiting for a finisher</span>
    </li>
  );
}

interface Props {
  rounds: RoundResult[];
  currentRound: number | null;
}

export default function RoundBoard({ rounds, currentRound }: Props) {
  const current = currentRound === null ? undefined : rounds.find((r) => r.round === currentRound);
  const currentTop = topThree(current);
  const earlier =
    currentRound === null
      ? []
      : rounds
          .filter((r) => r.round < currentRound)
          .sort((a, b) => b.round - a.round);

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="rounded-3xl border-2 border-sci bg-white p-5 md:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl md:text-3xl font-bold text-indigo">This round&apos;s top 3</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDE8E8] px-2.5 py-1 text-xs font-bold text-coral">
            <span className="h-2 w-2 rounded-full bg-coral" />
            LIVE
          </span>
        </div>

        {currentRound === null ? (
          <p className="mt-4 text-base md:text-xl text-muted">The first player starts the prize clock</p>
        ) : currentTop.length === 0 ? (
          <>
            <p className="mt-1 text-sm md:text-base text-muted tabular-nums">
              {current ? roundLabel(current) : `Round ${currentRound}`}
            </p>
            <p className="mt-5 text-base md:text-xl text-muted">
              No one has finished all three games this round yet
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm md:text-base text-muted tabular-nums">
              {current ? roundLabel(current) : `Round ${currentRound}`}
            </p>
            <ol className="mt-5 space-y-4 md:space-y-5">
              {[1, 2, 3].map((rank) => {
                const entry = currentTop.find((t) => t.rank === rank);
                return entry ? (
                  <TopRow key={rank} entry={entry} size={LARGE} />
                ) : (
                  <WaitingRow key={rank} rank={rank} size={LARGE} />
                );
              })}
            </ol>
          </>
        )}
      </section>

      <section>
        <h2 className="font-display px-1 text-lg md:text-2xl font-bold text-indigo">Earlier rounds</h2>
        {earlier.length === 0 ? (
          <p className="mt-3 rounded-3xl border border-line bg-white p-5 text-base text-muted-2 shadow-sm">
            No earlier rounds yet
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {earlier.map((round) => {
              const top = topThree(round);
              return (
                <li
                  key={round.round}
                  className="rounded-2xl border border-line bg-white p-4 md:p-5 shadow-sm"
                >
                  <p className="text-sm md:text-base font-bold text-muted tabular-nums">{roundLabel(round)}</p>
                  {top.length === 0 ? (
                    <p className="mt-2 text-sm md:text-base text-muted-2">No finishers this round</p>
                  ) : (
                    <ol className="mt-2 space-y-2">
                      {top.map((entry) => (
                        <TopRow key={entry.rank} entry={entry} size={SMALL} />
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
