import { render, screen, fireEvent, within } from '@testing-library/react';
import GameHub from '@/components/GameHub';
import type { MeResponse } from '@/lib/apiTypes';

const ME: MeResponse = {
  name: 'Ahmad',
  total: 1200,
  rank: 3,
  bests: { wordle: 700, riddles: 500 },
};

describe('GameHub', () => {
  it('lists all six games as buttons', () => {
    render(<GameHub name="Ahmad" me={ME} onPick={jest.fn()} />);
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('button')).toHaveLength(6);
    for (const title of ['Emoji Riddles', 'Tech Trivia', 'Password Challenge', 'Tech Wordle', 'Memory Match', 'Bug Hunter']) {
      expect(screen.getByRole('button', { name: new RegExp(title) })).toBeInTheDocument();
    }
  });

  it('shows the total, games played and rank in the header', () => {
    render(<GameHub name="Ahmad" me={ME} onPick={jest.fn()} />);
    expect(screen.getByText('Hey Ahmad 👋')).toBeInTheDocument();
    expect(screen.getByText('Your total: 1200 pts · 2 of 6 games played')).toBeInTheDocument();
    expect(screen.getByText("You're #3")).toBeInTheDocument();
  });

  it('shows each game\'s best, or that it is not played yet', () => {
    render(<GameHub name="Ahmad" me={ME} onPick={jest.fn()} />);
    expect(screen.getByText('Your best: 700 pts')).toBeInTheDocument();
    expect(screen.getByText('Your best: 500 pts')).toBeInTheDocument();
    expect(screen.getAllByText('Not played yet')).toHaveLength(4);
  });

  it('labels a played game as "Play again" and an unplayed one as "Play"', () => {
    render(<GameHub name="Ahmad" me={ME} onPick={jest.fn()} />);
    const wordle = screen.getByRole('button', { name: /Tech Wordle/ });
    const memory = screen.getByRole('button', { name: /Memory Match/ });
    expect(wordle).toHaveTextContent('Play again →');
    expect(memory).toHaveTextContent('Play →');
  });

  it('calls onPick with the game that was tapped', () => {
    const onPick = jest.fn();
    render(<GameHub name="Ahmad" me={ME} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /Bug Hunter/ }));
    expect(onPick).toHaveBeenCalledWith('bugs');
  });

  it('shows a loading state before the scores arrive, and game cards still work', () => {
    const onPick = jest.fn();
    render(<GameHub name="Ahmad" me={null} onPick={onPick} />);
    expect(screen.getByText('Loading your scores…')).toBeInTheDocument();
    expect(screen.getAllByText('Loading…')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /Emoji Riddles/ }));
    expect(onPick).toHaveBeenCalledWith('riddles');
  });

  it('shows the error with a retry when the scores cannot be loaded', () => {
    const onRetry = jest.fn();
    render(<GameHub name="Ahmad" me={null} error="Database unavailable" onPick={jest.fn()} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows a one-off notice when given one', () => {
    render(<GameHub name="Ahmad" me={ME} notice="That game had already finished." onPick={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('That game had already finished.');
  });

  it('links to the leaderboard and to the sign-up form', () => {
    render(<GameHub name="Ahmad" me={ME} onPick={jest.fn()} />);
    expect(screen.getByRole('link', { name: /view live leaderboard/i })).toHaveAttribute('href', '/leaderboard');
    expect(screen.getByRole('link', { name: /join gdsc/i })).toHaveAttribute('href', 'https://forms.gle/N5UBuhErH9wqjpV87');
  });

  it('never shows a maximum, "out of" or 1000', () => {
    render(<GameHub name="Ahmad" me={ME} onPick={jest.fn()} />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bmax\b|out of|1000/i);
  });

  it('uses responsive columns: 1, 2 and 3 across the breakpoints', () => {
    render(<GameHub name="Ahmad" me={ME} onPick={jest.fn()} />);
    expect(screen.getByRole('list')).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3');
  });
});
