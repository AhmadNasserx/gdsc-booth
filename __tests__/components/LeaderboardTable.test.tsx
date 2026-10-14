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

  it('uses one neutral colour for every score, with no colour bands', () => {
    const scored = (name: string, score: number, timestamp: number): LeaderboardEntry =>
      ({ name, score, timestamp, expiresAt: 9999999999999 });
    render(
      <LeaderboardTable
        entries={[
          scored('A', 950, 1),
          scored('B', 700, 2),
          scored('C', 500, 3),
          scored('D', 920, 4),
          scored('E', 300, 5),
        ]}
      />,
    );
    for (const score of ['950', '700', '500', '920', '300']) {
      expect(screen.getByText(score)).toHaveClass('text-[#1A73E8]');
    }
  });

  it('shows no progress bars or percentages for any row, including the podium', () => {
    const many: LeaderboardEntry[] = Array.from({ length: 6 }, (_, i) => ({
      name: `Player${i}`, score: 100 + i * 50, timestamp: i, expiresAt: 9999999999999,
    }));
    const { container } = render(<LeaderboardTable entries={many} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="width"]')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/%/);
  });

  it('never shows a maximum, a "/ 1000" or an "out of" in the rendered output', () => {
    const { container } = render(<LeaderboardTable entries={entries} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('1000');
    expect(text).not.toContain('/ 1000');
    expect(text).not.toMatch(/max/i);
    expect(text).not.toMatch(/out of/i);
  });
});
