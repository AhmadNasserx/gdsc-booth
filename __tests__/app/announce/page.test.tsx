import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnnouncePage from '@/app/announce/page';
import type { LeaderboardResponse } from '@/lib/apiTypes';

const NOW = Date.now();

function board(masked = false): LeaderboardResponse {
  // Player i finished i minutes ago, so a later start time leaves out the earlier finishers.
  const entries = Array.from({ length: 11 }, (_, i) => ({
    name: `Player ${i + 1}`,
    score: 3000 - i * 100,
    timestamp: NOW - i * 60_000,
    finishedAt: NOW - i * 60_000,
    expiresAt: NOW + 1e9,
  }));
  return {
    entries,
    event: { startedAt: NOW - 3_600_000, now: NOW, roundMs: 3_600_000, currentRound: 2, roundEndsAt: NOW + 3_600_000 },
    rounds: [{ round: 1, start: NOW - 3_600_000, end: NOW, top: [{ name: 'Player 1', score: 3000, rank: 1 }] }],
    masked,
  };
}

let boardStatus = 200;
let masked = false;
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  if (url === '/api/admin/mask') {
    masked = JSON.parse(String(init?.body)).masked;
    return { ok: true, status: 200, json: async () => ({ masked }) };
  }
  return { ok: boardStatus === 200, status: boardStatus, json: async () => board(masked) };
});

beforeEach(() => {
  boardStatus = 200;
  masked = false;
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
});

afterEach(() => jest.useRealTimers());

function maskCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === '/api/admin/mask').map(([, init]) => JSON.parse(String(init?.body)));
}

it('reads the full board from the staff route and offers the day, a start time and each hour', async () => {
  render(<AnnouncePage />);
  expect(await screen.findByRole('button', { name: /top 9 so far today/i })).toBeEnabled();
  expect(fetchMock).toHaveBeenCalledWith('/api/admin/leaderboard', expect.anything());
  expect(screen.getByLabelText(/since/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /round 1/i })).toBeInTheDocument();
});

it('asks staff to sign in when the admin cookie is missing', async () => {
  boardStatus = 401;
  render(<AnnouncePage />);
  expect(await screen.findByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/admin/login?next=/announce');
});

it('hides and shows the public leaderboard on demand', async () => {
  render(<AnnouncePage />);
  fireEvent.click(await screen.findByRole('button', { name: /hide it now/i }));
  expect(await screen.findByText('Public leaderboard: hidden')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /show it again/i }));
  expect(await screen.findByText('Public leaderboard: visible')).toBeInTheDocument();
  expect(maskCalls()).toEqual([{ masked: true }, { masked: false }]);
});

it('runs the day ceremony from #9 up and hides the public board as it starts', async () => {
  render(<AnnouncePage />);
  fireEvent.click(await screen.findByRole('button', { name: /top 9 so far today/i }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Meet the Top 9' })).toBeInTheDocument();
  expect(maskCalls()).toEqual([{ masked: true }]);
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

it('reveals any number of winners, from any start time', async () => {
  render(<AnnouncePage />);
  fireEvent.click(await screen.findByRole('radio', { name: '3' }));
  const d = new Date(NOW - 4.5 * 60_000);
  fireEvent.change(screen.getByLabelText(/since/i), {
    target: { value: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` },
  });
  fireEvent.click(screen.getByRole('button', { name: /start →/i }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Meet the Top 3' })).toBeInTheDocument();
  expect(document.querySelectorAll('.ann-slot')).toHaveLength(3);
});

it('leaves the board as it is when staff untick the hide option', async () => {
  render(<AnnouncePage />);
  fireEvent.click(await screen.findByLabelText(/hide the public leaderboard when a ceremony starts/i));
  fireEvent.click(screen.getByRole('button', { name: /top 9 so far today/i }));
  await screen.findByRole('heading', { level: 1, name: 'Meet the Top 9' });
  expect(maskCalls()).toEqual([]);
});

it('goes back to the choices with Escape', async () => {
  render(<AnnouncePage />);
  fireEvent.click(await screen.findByRole('button', { name: /top 9 so far today/i }));
  await screen.findByRole('heading', { level: 1, name: 'Meet the Top 9' });
  act(() => {
    fireEvent.keyDown(window, { key: 'Escape' });
  });
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Announce the winners' })).toBeInTheDocument());
});
