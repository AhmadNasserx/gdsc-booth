import { render, screen } from '@testing-library/react';
import LeaderboardTable from '@/components/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/types';

const entries: LeaderboardEntry[] = [
  { name: 'Ahmad', score: 350, timestamp: 1, expiresAt: 9999999999999 },
  { name: 'Sara', score: 400, timestamp: 2, expiresAt: 9999999999999 },
  { name: 'Ali', score: 200, timestamp: 3, expiresAt: 9999999999999 },
];

describe('LeaderboardTable', () => {
  it('renders entries sorted by score, highest first', () => {
    render(<LeaderboardTable entries={entries} />);
    // Sara (400) should be in the 1st-place podium card
    const firstCard = screen.getByText('1st Place').closest('div')!;
    expect(firstCard).toHaveTextContent('Sara');
    // Ahmad (350) should be in the 2nd-place card
    const secondCard = screen.getByText('2nd Place').closest('div')!;
    expect(secondCard).toHaveTextContent('Ahmad');
  });

  it('shows at most 20 entries', () => {
    const many: LeaderboardEntry[] = Array.from({ length: 25 }, (_, i) => ({
      name: `Player${i}`, score: i * 10, timestamp: i, expiresAt: 9999999999999,
    }));
    render(<LeaderboardTable entries={many} />);
    expect(screen.getByText('Player24')).toBeInTheDocument(); // rank 1 — shown
    expect(screen.queryByText('Player4')).not.toBeInTheDocument(); // rank 21 — hidden
  });

  it('shows empty state when no entries', () => {
    render(<LeaderboardTable entries={[]} />);
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument();
  });

  it('shows the game emoji with its title next to the name', () => {
    render(
      <LeaderboardTable
        entries={[
          { name: 'Sara', score: 900, game: 'memory', timestamp: 1, expiresAt: 9999999999999 },
          { name: 'Ali', score: 200, game: 'riddles', timestamp: 2, expiresAt: 9999999999999 },
        ]}
      />,
    );
    expect(screen.getByTitle('Memory Match')).toHaveTextContent('🧠');
    expect(screen.getByTitle('Emoji Riddles')).toHaveTextContent('🧩');
  });

  it('shows no emoji for entries without a game', () => {
    render(<LeaderboardTable entries={entries} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses the 1000-point colour bands (920 / 690 / 460)', () => {
    const scored = (name: string, score: number, timestamp: number): LeaderboardEntry =>
      ({ name, score, timestamp, expiresAt: 9999999999999 });
    render(
      <LeaderboardTable
        entries={[
          scored('A', 1000, 1),
          scored('B', 700, 2),
          scored('C', 500, 3),
          scored('D', 920, 4),
          scored('E', 919, 5),
          scored('F', 690, 6),
          scored('G', 460, 7),
          scored('H', 459, 8),
        ]}
      />,
    );
    expect(screen.getByText('1000')).toHaveClass('text-[#4285F4]');
    expect(screen.getByText('920')).toHaveClass('text-[#4285F4]');
    expect(screen.getByText('919')).toHaveClass('text-[#34A853]');
    expect(screen.getByText('690')).toHaveClass('text-[#34A853]');
    expect(screen.getByText('460')).toHaveClass('text-[#FBBC04]');
    expect(screen.getByText('459')).toHaveClass('text-[#EA4335]');
  });
});
