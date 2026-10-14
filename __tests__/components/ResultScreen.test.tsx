import { render, screen, fireEvent } from '@testing-library/react';
import ResultScreen from '@/components/ResultScreen';
import type { RunResult } from '@/lib/apiTypes';

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    game: 'wordle',
    score: 350,
    best: 350,
    improved: true,
    total: 850,
    rank: 2,
    gamesPlayed: ['wordle'],
    ...overrides,
  };
}

function renderScreen(overrides: Partial<RunResult> = {}, props: Partial<Parameters<typeof ResultScreen>[0]> = {}) {
  const handlers = { onPlayAgain: jest.fn(), onNextGame: jest.fn(), onBackToGames: jest.fn() };
  render(
    <ResultScreen
      game="wordle"
      result={result(overrides)}
      nextGame="riddles"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ResultScreen', () => {
  it('shows the points earned for this run', () => {
    renderScreen();
    expect(screen.getByText('+350 pts')).toBeInTheDocument();
    expect(screen.getByText('Tech Wordle')).toBeInTheDocument();
  });

  it('celebrates a new best', () => {
    renderScreen({ improved: true });
    expect(screen.getByText('🎉 New best!')).toBeInTheDocument();
    expect(screen.queryByText('Can you beat it?')).not.toBeInTheDocument();
  });

  it('shows the current best and a nudge when the run did not beat it', () => {
    renderScreen({ improved: false, score: 200, best: 700 });
    expect(screen.getByText('Your best is 700 pts.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Can you beat it?')).toBeInTheDocument();
    expect(screen.queryByText('🎉 New best!')).not.toBeInTheDocument();
  });

  it('shows the total and rank', () => {
    renderScreen();
    expect(screen.getByText("Your total: 850 pts · You're #2")).toBeInTheDocument();
  });

  it('renders confetti only when the run improved, and hides it from assistive tech', () => {
    const { container, unmount } = render(
      <ResultScreen game="wordle" result={result({ improved: true })} nextGame={null}
        onPlayAgain={jest.fn()} onNextGame={jest.fn()} onBackToGames={jest.fn()} />,
    );
    expect(container.querySelectorAll('.anim-confetti').length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-hidden="true"].pointer-events-none')).toBeInTheDocument();
    unmount();

    const { container: plain } = render(
      <ResultScreen game="wordle" result={result({ improved: false })} nextGame={null}
        onPlayAgain={jest.fn()} onNextGame={jest.fn()} onBackToGames={jest.fn()} />,
    );
    expect(plain.querySelectorAll('.anim-confetti')).toHaveLength(0);
  });

  it('calls the matching handler for each button', () => {
    const handlers = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /play again/i }));
    fireEvent.click(screen.getByRole('button', { name: /next game/i }));
    fireEvent.click(screen.getByRole('button', { name: /back to games/i }));
    expect(handlers.onPlayAgain).toHaveBeenCalledTimes(1);
    expect(handlers.onNextGame).toHaveBeenCalledTimes(1);
    expect(handlers.onBackToGames).toHaveBeenCalledTimes(1);
  });

  it('links to the leaderboard', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: /view leaderboard/i })).toHaveAttribute('href', '/leaderboard');
  });

  it('hides "Next game" and says so when all six games are played', () => {
    renderScreen({}, { nextGame: null });
    expect(screen.queryByRole('button', { name: /next game/i })).not.toBeInTheDocument();
    expect(screen.getByText(/you've played all six games/i)).toBeInTheDocument();
  });

  it('gives every button a visible focus ring and a touch-sized height', () => {
    renderScreen();
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toMatch(/min-h-12/);
      expect(button.className).toMatch(/focus-visible:ring-4/);
    }
  });

  it('never shows a maximum, "out of" or 1000', () => {
    renderScreen({ improved: false, best: 700 });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bmax\b|out of|1000/i);
  });
});
