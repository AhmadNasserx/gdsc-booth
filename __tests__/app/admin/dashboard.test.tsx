import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPage from '@/app/admin/page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const ROUND_MS = 3600000;

interface MockReply {
  ok: boolean;
  status: number;
  headers?: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
}

function ok(body: unknown): MockReply {
  return { ok: true, status: 200, json: async () => body };
}

function fail(status: number, body: unknown): MockReply {
  return { ok: false, status, headers: { get: () => null }, json: async () => body };
}

function overview(event: Record<string, unknown> = {}, paused = false) {
  return {
    event: { startedAt: null, now: NOW, roundMs: ROUND_MS, currentRound: null, roundEndsAt: null, ...event },
    paused,
    audit: [],
  };
}

const WINNERS = {
  startedAt: NOW - ROUND_MS,
  rounds: [
    {
      round: 1,
      start: NOW - ROUND_MS,
      end: NOW,
      current: false,
      winners: [
        {
          rank: 1,
          name: 'Ahmad',
          normKey: 'ahmad',
          score: 1500,
          phone: '+96170123456',
          prizeGiven: false,
          prizeGivenAt: null,
        },
        {
          rank: 2,
          name: 'Omar',
          normKey: 'omar',
          score: 1200,
          phone: null,
          prizeGiven: false,
          prizeGivenAt: null,
        },
      ],
    },
  ],
};

const PLAYERS = [
  {
    key: 'ahmad',
    name: 'Ahmad',
    score: 1500,
    games: { riddles: 500, memory: 500, trivia: 500 },
    gamesPlayed: 3,
    finished: true,
    finishedAt: NOW - 1000,
    finishedRound: 1,
    timestamp: 1,
  },
  {
    key: 'sara',
    name: 'Sara',
    score: 300,
    games: { riddles: 300 },
    gamesPlayed: 1,
    finished: false,
    finishedAt: null,
    finishedRound: null,
    timestamp: 2,
  },
];

// Keyed by "METHOD url". Anything not listed answers 404.
const DEFAULT_REPLIES: Record<string, MockReply> = {
  'GET /api/admin/me': ok({ ok: true }),
  'GET /api/admin/overview': ok(overview()),
  'GET /api/admin/winners': ok(WINNERS),
  'GET /api/admin/players': ok({ players: PLAYERS }),
  'POST /api/admin/pause': ok({ ok: true }),
  'POST /api/admin/clock': ok({ ok: true }),
  'DELETE /api/admin/players': ok({ ok: true }),
};

/** Routes global.fetch by method and URL. Unknown requests get a 404 instead of throwing. */
function routeFetch(overrides: Record<string, MockReply> = {}) {
  const replies = { ...DEFAULT_REPLIES, ...overrides };
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    return replies[key] ?? fail(404, { error: 'not found' });
  }) as unknown as typeof fetch;
}

/** The request sent with the given method to the given URL, as [url, init]. Throws until it is made, so waitFor can retry. */
function sentRequest(method: string, url: string): [string, RequestInit] {
  const call = (global.fetch as jest.Mock).mock.calls.find(
    ([called, init]) => String(called) === url && (init as RequestInit | undefined)?.method === method,
  );
  if (!call) throw new Error(`No ${method} request was sent to ${url}`);
  return call as [string, RequestInit];
}

function playersSection() {
  return screen.getByRole('region', { name: 'Players' });
}

/** The card for one player in the Players list. */
function playerCard(name: string): HTMLElement {
  const card = within(playersSection()).getByText(name).closest('li');
  if (!card) throw new Error(`No player card for ${name}`);
  return card;
}

describe('Admin dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeFetch();
  });

  it('sends the visitor to /admin/login when the session is missing or expired', async () => {
    routeFetch({ 'GET /api/admin/me': fail(401, { error: 'Sign in first.' }) });
    render(<AdminPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin/login'));
  });

  it('lists the hour 1 winner and links the phone number with a tel: link', async () => {
    render(<AdminPage />);
    const hour1 = await screen.findByRole('article', { name: 'Round 1' });
    expect(within(hour1).getByText('Ahmad')).toBeInTheDocument();
    expect(within(hour1).getByRole('link', { name: '+96170123456' })).toHaveAttribute('href', 'tel:+96170123456');
  });

  it('shows No number on file for a winner without a phone number', async () => {
    render(<AdminPage />);
    const hour1 = await screen.findByRole('article', { name: 'Round 1' });
    expect(within(hour1).getByText('Omar')).toBeInTheDocument();
    expect(within(hour1).getByText('No number on file')).toBeInTheDocument();
  });

  it('filters the players list by the search box, and only by name', async () => {
    render(<AdminPage />);
    await screen.findByRole('region', { name: 'Players' });
    expect(within(playersSection()).getByText('Ahmad')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search players by name'), 'sar');

    expect(within(playersSection()).queryByText('Ahmad')).not.toBeInTheDocument();
    expect(within(playersSection()).getByText('Sara')).toBeInTheDocument();
  });

  it('shows Start clock now when the event clock has not started', async () => {
    render(<AdminPage />);
    expect(await screen.findByRole('button', { name: 'Start clock now' })).toBeInTheDocument();
  });

  it('hides Start clock now once the event clock has started', async () => {
    routeFetch({
      'GET /api/admin/overview': ok(overview({ startedAt: NOW - 600000, currentRound: 1, roundEndsAt: NOW + 3000000 })),
    });
    render(<AdminPage />);
    expect(await screen.findByText(/Event started/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start clock now' })).not.toBeInTheDocument();
  });

  it('keeps the reset button disabled for lowercase reset and enables it for RESET', async () => {
    routeFetch({
      'GET /api/admin/overview': ok(overview({ startedAt: NOW - 600000, currentRound: 1, roundEndsAt: NOW + 3000000 })),
    });
    render(<AdminPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reset event' }));

    const dialog = await screen.findByRole('dialog', { name: 'Reset the event clock?' });
    const confirm = within(dialog).getByRole('button', { name: 'Reset event' });
    const input = within(dialog).getByLabelText('Type RESET to confirm');

    await userEvent.type(input, 'reset');
    expect(confirm).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'RESET');
    expect(confirm).toBeEnabled();
  });

  it('sends the reset with the RESET confirmation once it is typed', async () => {
    routeFetch({
      'GET /api/admin/overview': ok(overview({ startedAt: NOW - 600000, currentRound: 1, roundEndsAt: NOW + 3000000 })),
    });
    render(<AdminPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reset event' }));

    const dialog = await screen.findByRole('dialog', { name: 'Reset the event clock?' });
    await userEvent.type(within(dialog).getByLabelText('Type RESET to confirm'), 'RESET');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset event' }));

    await waitFor(() => expect(sentRequest('POST', '/api/admin/clock')).toBeDefined());
    const [, init] = sentRequest('POST', '/api/admin/clock');
    expect(JSON.parse(init.body as string)).toEqual({ action: 'reset', confirm: 'RESET' });
  });

  it('labels the pause button Pause game while the game is live, and pausing posts paused true', async () => {
    render(<AdminPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pause game' }));

    await waitFor(() => expect(sentRequest('POST', '/api/admin/pause')).toBeDefined());
    const [, init] = sentRequest('POST', '/api/admin/pause');
    expect(JSON.parse(init.body as string)).toEqual({ paused: true });
  });

  it('deletes a player after confirming, sending their key', async () => {
    render(<AdminPage />);
    await screen.findByRole('region', { name: 'Players' });
    await userEvent.click(within(playerCard('Sara')).getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete player?' });
    expect(within(dialog).getByText(/Sara/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete player' }));

    await waitFor(() => expect(sentRequest('DELETE', '/api/admin/players')).toBeDefined());
    const [, init] = sentRequest('DELETE', '/api/admin/players');
    expect(JSON.parse(init.body as string)).toEqual({ key: 'sara' });
  });

  it('offers the winners CSV download from /api/admin/export', async () => {
    render(<AdminPage />);
    const link = await screen.findByRole('link', { name: 'Download winners CSV' });
    expect(link).toHaveAttribute('href', '/api/admin/export');
  });

  it('shows the empty message when there are no recent actions', async () => {
    render(<AdminPage />);
    expect(await screen.findByText('No actions yet.')).toBeInTheDocument();
  });
});
