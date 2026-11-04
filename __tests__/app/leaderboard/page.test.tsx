import { act, render, screen } from '@testing-library/react';
import LeaderboardPage from '@/app/leaderboard/page';
import type { LeaderboardResponse } from '@/lib/apiTypes';

const MINUTE = 60_000;
const NOW = new Date(2026, 10, 4, 14, 30).getTime();

function payload(event: Partial<LeaderboardResponse['event']> = {}): LeaderboardResponse {
  return {
    entries: [],
    rounds: [],
    event: {
      startedAt: NOW - 30 * MINUTE,
      now: NOW,
      roundMs: 60 * MINUTE,
      currentRound: 2,
      roundEndsAt: NOW + 10 * MINUTE,
      ...event,
    },
  };
}

function mockFetch(body: LeaderboardResponse) {
  const fn = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

// Lets the fetch promise chain settle inside act.
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe('LeaderboardPage countdown', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('shows "Loading…" until the first response arrives', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<LeaderboardPage />);
    const subline = screen.getByText('Top 3 each hour win a prize. Finish all three games to qualify.');
    expect(subline.previousElementSibling).toHaveTextContent('Loading…');
  });

  it('says the prize clock starts with the first player when nobody has started', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockFetch(payload({ startedAt: null, currentRound: null, roundEndsAt: null }));
    render(<LeaderboardPage />);
    expect(await screen.findByText('Prize clock starts with the first player')).toBeInTheDocument();
  });

  it('shows the hour and the time left in that hour', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockFetch(payload());
    render(<LeaderboardPage />);
    expect(await screen.findByText('Hour 2 prize in')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('ticks down every second', async () => {
    jest.useFakeTimers({ now: NOW });
    mockFetch(payload());
    render(<LeaderboardPage />);
    await flush();
    expect(screen.getByText('10:00')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('09:59')).toBeInTheDocument();
  });

  it('uses the server clock offset, so a wrong device clock does not change the countdown', async () => {
    const clientNow = NOW;
    const serverNow = clientNow + 5 * MINUTE;
    jest.spyOn(Date, 'now').mockReturnValue(clientNow);
    mockFetch(payload({ now: serverNow, roundEndsAt: serverNow + 10 * MINUTE }));
    render(<LeaderboardPage />);
    expect(await screen.findByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText('15:00')).not.toBeInTheDocument();
  });
});
