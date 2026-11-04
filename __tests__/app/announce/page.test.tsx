import { act, fireEvent, render, screen } from '@testing-library/react';
import AnnouncePage from '@/app/announce/page';
import type { LeaderboardResponse } from '@/lib/apiTypes';

const NOW = Date.UTC(2026, 10, 5, 10, 0, 0);

function reply(): LeaderboardResponse {
  const entries = Array.from({ length: 11 }, (_, i) => ({
    name: `Player ${i + 1}`,
    score: 3000 - i * 100,
    timestamp: NOW - i,
    finishedAt: NOW - i,
    expiresAt: NOW + 1e9,
  }));
  return {
    entries,
    event: { startedAt: NOW - 3_600_000, now: NOW, roundMs: 3_600_000, currentRound: 2, roundEndsAt: NOW + 3_600_000 },
    rounds: [{ round: 1, start: NOW - 3_600_000, end: NOW, top: [{ name: 'Player 1', score: 3000, rank: 1 }] }],
  };
}

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => reply() })) as unknown as typeof fetch;
  HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
});

afterEach(() => jest.useRealTimers());

it('offers the day top 9 and each hour with winners', async () => {
  render(<AnnouncePage />);
  expect(await screen.findByRole('button', { name: /top 9 of the day/i })).toBeEnabled();
  expect(screen.getByRole('button', { name: /hour 1/i })).toBeInTheDocument();
});

it('runs the day ceremony from #9 up, with the winners on the wall of fame', async () => {
  render(<AnnouncePage />);
  fireEvent.click(await screen.findByRole('button', { name: /top 9 of the day/i }));
  expect(screen.getByRole('heading', { level: 1, name: 'Meet the Top 9' })).toBeInTheDocument();
  expect(document.querySelectorAll('.ann-slot')).toHaveLength(9);
  expect(document.body.textContent).not.toContain('Player 10');

  jest.useFakeTimers();
  act(() => {
    fireEvent.keyDown(window, { key: ' ' });
  });
  expect(document.querySelector('.ann-no')?.textContent).toBe('9');
  // A second press lands the spin at once.
  act(() => {
    jest.advanceTimersByTime(400);
    fireEvent.keyDown(window, { key: ' ' });
    jest.advanceTimersByTime(500);
  });
  expect(document.querySelector('[data-v="rank"] .ann-nm')?.textContent).toBe('Player 9');
  expect(document.querySelector('.ann-slot[data-r="9"]')).toHaveClass('ann-won');
});

it('goes back to the choices with Escape', async () => {
  render(<AnnouncePage />);
  fireEvent.click(await screen.findByRole('button', { name: /top 9 of the day/i }));
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });
  expect(await screen.findByRole('heading', { name: 'Announce the winners' })).toBeInTheDocument();
});
