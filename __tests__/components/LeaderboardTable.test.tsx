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
});
