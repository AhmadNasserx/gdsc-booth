import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LeaderboardPage from '@/app/leaderboard/page';

const ENTRIES = [{ name: 'Sara', score: 900, games: { riddles: 900 }, timestamp: 1, expiresAt: Date.now() + 100000 }];

function mockFetch(pinOk: string) {
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    const { pin } = JSON.parse(init?.body as string) as { pin: string };
    return pin === pinOk
      ? { ok: true, status: 200, json: async () => ENTRIES }
      : { ok: false, status: 403, json: async () => ({ error: 'Wrong PIN' }) };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('Leaderboard page', () => {
  it('is hidden behind a PIN and asks for no scores until one is entered', () => {
    mockFetch('4821');
    render(<LeaderboardPage />);
    expect(screen.getByText('Leaderboard is hidden')).toBeInTheDocument();
    expect(screen.queryByText('Sara')).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows an error for a wrong PIN and keeps the board hidden', async () => {
    mockFetch('4821');
    render(<LeaderboardPage />);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN');
    expect(screen.queryByText('Sara')).not.toBeInTheDocument();
    expect(sessionStorage.getItem('leaderboardPin')).toBeNull();
  });

  it('reveals the leaderboard for the right PIN and remembers it for this tab', async () => {
    mockFetch('4821');
    render(<LeaderboardPage />);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4821' } });
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
    expect(await screen.findByText('Sara')).toBeInTheDocument();
    expect(sessionStorage.getItem('leaderboardPin')).toBe('4821');
  });

  it('opens straight to the board when this tab already has the PIN', async () => {
    mockFetch('4821');
    sessionStorage.setItem('leaderboardPin', '4821');
    render(<LeaderboardPage />);
    expect(await screen.findByText('Sara')).toBeInTheDocument();
  });

  it('goes back to the PIN screen when a saved PIN is no longer accepted', async () => {
    mockFetch('9999');
    sessionStorage.setItem('leaderboardPin', '4821');
    render(<LeaderboardPage />);
    await waitFor(() => expect(screen.getByText('Leaderboard is hidden')).toBeInTheDocument());
    expect(sessionStorage.getItem('leaderboardPin')).toBeNull();
  });
});
