import { render, screen } from '@testing-library/react';
import LeaderboardTable from '@/components/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/types';

const entries: LeaderboardEntry[] = [
  { name: 'Ahmad', score: 350, timestamp: 1, expiresAt: 9999999999999 },
  { name: 'Sara', score: 400, timestamp: 2, expiresAt: 9999999999999 },
  { name: 'Ali', score: 200, timestamp: 3, expiresAt: 9999999999999 },
];

describe('LeaderboardTable', () => {
  it('renders sorted by score descending', () => {
    render(<LeaderboardTable entries={entries} />);
    const rows = screen.getAllByRole('row');
    // rows[0] = header, rows[1] = Sara (400), rows[2] = Ahmad (350)
    expect(rows[1]).toHaveTextContent('Sara');
    expect(rows[1]).toHaveTextContent('400');
    expect(rows[2]).toHaveTextContent('Ahmad');
  });

  it('shows top 20 only', () => {
    const many: LeaderboardEntry[] = Array.from({ length: 25 }, (_, i) => ({
      name: `Player${i}`, score: i * 10, timestamp: i, expiresAt: 9999999999999,
    }));
    render(<LeaderboardTable entries={many} />);
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(21); // 1 header + 20 data rows
  });

  it('shows empty state when no entries', () => {
    render(<LeaderboardTable entries={[]} />);
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument();
  });
});
