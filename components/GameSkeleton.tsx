import type { Tab } from '@/lib/types';

interface Props {
  /** The game being loaded, or null when the game is not known yet. */
  game: Tab | null;
  /** Read aloud to screen reader users while the game loads. */
  label: string;
}

const OPTIONS = [0, 1, 2, 3];
const CARDS = Array.from({ length: 16 }, (_, i) => i);

/**
 * Placeholder shaped like the real game, so the layout barely moves when it appears.
 * The skeleton itself is hidden from assistive tech; the status line next to it is what is read.
 */
export default function GameSkeleton({ game, label }: Props) {
  return (
    <>
      <div className="flex w-full flex-col items-center py-4" aria-hidden="true">
        {game === 'memory' ? (
          <>
            <div className="flex w-full max-w-sm gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 flex-1 rounded-2xl skeleton" />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full max-w-xs sm:max-w-sm mt-4">
              {CARDS.map((i) => (
                <div key={i} className="aspect-square rounded-xl skeleton" />
              ))}
            </div>
          </>
        ) : game === 'riddles' || game === 'trivia' ? (
          <div className="flex w-full flex-col items-center gap-5">
            <div className="h-4 w-40 rounded-full skeleton" />
            <div className="h-16 w-full max-w-xs rounded-2xl skeleton" />
            <div className="grid grid-cols-2 gap-3 w-full">
              {OPTIONS.map((i) => (
                <div key={i} className="h-14 rounded-2xl skeleton" />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-40 w-full rounded-2xl skeleton" />
        )}
      </div>
      <p role="status" className="sr-only">
        {label}
      </p>
    </>
  );
}
