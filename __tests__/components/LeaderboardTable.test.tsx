import { render, screen, within } from '@testing-library/react';
import LeaderboardTable, { sortEntries } from '@/components/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/types';

const FAR_FUTURE = 9999999999999;

const entries: LeaderboardEntry[] = [
  { name: 'Ahmad', score: 850, timestamp: 1, expiresAt: FAR_FUTURE },
  { name: 'Sara', score: 1200, timestamp: 2, expiresAt: FAR_FUTURE },
  { name: 'Ali', score: 400, timestamp: 3, expiresAt: FAR_FUTURE },
];

describe('LeaderboardTable', () => {
  it('renders entries sorted by total, highest first', () => {
    render(<LeaderboardTable entries={entries} />);
    expect(screen.getByText('1st Place').closest('div')).toHaveTextContent('Sara');
    expect(screen.getByText('2nd Place').closest('div')).toHaveTextContent('Ahmad');
    expect(screen.getByText('3rd Place').closest('div')).toHaveTextContent('Ali');
  });

  it('breaks a tie in score by the earlier timestamp', () => {
    const tied: LeaderboardEntry[] = [
      { name: 'Late', score: 900, timestamp: 200, expiresAt: FAR_FUTURE },
      { name: 'Early', score: 900, timestamp: 100, expiresAt: FAR_FUTURE },
      { name: 'Top', score: 1000, timestamp: 300, expiresAt: FAR_FUTURE },
    ];
    expect(sortEntries(tied).map((e) => e.name)).toEqual(['Top', 'Early', 'Late']);
    render(<LeaderboardTable entries={tied} />);
    expect(screen.getByText('2nd Place').closest('div')).toHaveTextContent('Early');
    expect(screen.getByText('3rd Place').closest('div')).toHaveTextContent('Late');
  });

  it('shows the total points next to each name', () => {
    render(<LeaderboardTable entries={entries} />);
    expect(screen.getByText('1200')).toBeInTheDocument();
    expect(screen.getByText('850')).toBeInTheDocument();
    expect(screen.getByText('400')).toBeInTheDocument();
  });

  it('shows at most 20 entries, ranked from the top', () => {
    const many: LeaderboardEntry[] = Array.from({ length: 25 }, (_, i) => ({
      name: `Player${i}`, score: i * 10, timestamp: i, expiresAt: FAR_FUTURE,
    }));
    render(<LeaderboardTable entries={many} />);
    expect(screen.getByText('Player24')).toBeInTheDocument();
    expect(screen.queryByText('Player4')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no entries', () => {
    render(<LeaderboardTable entries={[]} />);
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument();
  });

  it('shows an emoji chip for each game the player has a score in, with the game as its title', () => {
    render(
      <LeaderboardTable
        entries={[
          {
            name: 'Sara',
            score: 500,
            games: { memory: 500, riddles: 0 },
            timestamp: 1,
            expiresAt: FAR_FUTURE,
          },
        ]}
      />,
    );
    expect(screen.getByTitle('Memory Match')).toHaveTextContent('🧠');
    expect(screen.getByTitle('Emoji Riddles')).toHaveTextContent('🧩');
    expect(screen.queryByTitle('Tech Trivia')).not.toBeInTheDocument();
  });

  it('shows no chips for an older entry without games', () => {
    render(<LeaderboardTable entries={[{ name: 'Old', score: 300, timestamp: 1, expiresAt: FAR_FUTURE }]} />);
    expect(screen.getByText('Old')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps the chips in the row for each non-podium entry', () => {
    const many: LeaderboardEntry[] = [
      { name: 'A', score: 900, timestamp: 1, expiresAt: FAR_FUTURE },
      { name: 'B', score: 800, timestamp: 2, expiresAt: FAR_FUTURE },
      { name: 'C', score: 700, timestamp: 3, expiresAt: FAR_FUTURE },
      { name: 'Fourth', score: 600, games: { riddles: 600 }, timestamp: 4, expiresAt: FAR_FUTURE },
    ];
    render(<LeaderboardTable entries={many} />);
    const row = screen.getByText('Fourth').closest('div')!;
    expect(within(row).getByTitle('Emoji Riddles')).toBeInTheDocument();
    expect(within(row).getByText('#4')).toBeInTheDocument();
  });

  it('never shows a bar, a maximum or "out of"', () => {
    const { container } = render(<LeaderboardTable entries={entries} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bmax\b|out of|1000|\/\s*\d/i);
    expect(container.querySelector('[style*="width"]')).toBeNull();
  });
});
