import { render, screen, fireEvent } from '@testing-library/react';
import ResultScreen from '@/components/ResultScreen';
import type { RunResult } from '@/lib/apiTypes';

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    game: 'riddles',
    score: 350,
    best: 350,
    improved: true,
    total: 850,
    rank: 2,
    gamesPlayed: ['riddles'],
    ...overrides,
  };
}

function renderScreen(overrides: Partial<RunResult> = {}, props: Partial<Parameters<typeof ResultScreen>[0]> = {}) {
  const handlers = { onNextGame: jest.fn() };
  render(<ResultScreen game="riddles" result={result(overrides)} nextGame="memory" {...handlers} {...props} />);
  return handlers;
}

describe('ResultScreen', () => {
  it('shows the points earned for this game', () => {
    renderScreen();
    expect(screen.getByText('+350 pts')).toBeInTheDocument();
    expect(screen.getByText('Emoji Riddles')).toBeInTheDocument();
  });

  it('shows the total and rank', () => {
    renderScreen();
    expect(screen.getByText("Your total: 850 pts · You're #2")).toBeInTheDocument();
  });

  it('offers no replay and no way back to a games list', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: /play again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to games/i })).not.toBeInTheDocument();
  });

  it('renders confetti only when the game scored, and hides it from assistive tech', () => {
    const { container, unmount } = render(
      <ResultScreen game="riddles" result={result({ improved: true })} nextGame={null} onNextGame={jest.fn()} />,
    );
    expect(container.querySelectorAll('.anim-confetti').length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-hidden="true"].pointer-events-none')).toBeInTheDocument();
    unmount();

    const { container: plain } = render(
      <ResultScreen game="riddles" result={result({ improved: false })} nextGame={null} onNextGame={jest.fn()} />,
    );
    expect(plain.querySelectorAll('.anim-confetti')).toHaveLength(0);
  });

  it('names the next game on the continue button and calls its handler', () => {
    const handlers = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /next: memory match/i }));
    expect(handlers.onNextGame).toHaveBeenCalledTimes(1);
  });

  it('offers the final results after the last game', () => {
    const handlers = renderScreen({}, { nextGame: null });
    fireEvent.click(screen.getByRole('button', { name: /see my results/i }));
    expect(handlers.onNextGame).toHaveBeenCalledTimes(1);
  });

  it('does not link to the hidden leaderboard', () => {
    renderScreen();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('gives the button a visible focus ring and a touch-sized height', () => {
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
