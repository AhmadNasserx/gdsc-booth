import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import PlayPage from '@/app/play/page';

const mockPush = jest.fn();
// Stable router object, as Next.js provides; a fresh object each render would re-run effects.
const mockRouter = { push: mockPush };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

// Game components are replaced by probes: each records the props the page gives it,
// so the tests can drive `act` and `onDone` the way a real game would.
interface ProbeProps {
  act: (body: unknown) => Promise<unknown>;
  onDone: (result: unknown) => void;
  questions?: unknown[];
  cards?: number;
}
const mockProbes: Record<string, ProbeProps> = {};

function mockGame(name: string) {
  return {
    __esModule: true,
    default: (props: ProbeProps) => {
      mockProbes[name] = props;
      return <div data-testid={`game-${name}`}>{`${name} mounted`}</div>;
    },
  };
}

jest.mock('@/components/games/EmojiRiddles', () => mockGame('riddles'));
jest.mock('@/components/games/TechTrivia', () => mockGame('trivia'));
jest.mock('@/components/games/MemoryMatch', () => mockGame('memory'));

interface FetchReply { status?: number; body: unknown }
type FetchHandler = (url: string, body: Record<string, unknown>) => FetchReply;

let handler: FetchHandler;

const FRESH = { name: 'Ahmad', total: 0, rank: null, bests: {} };
const meWith = (bests: Record<string, number>, total = 1200, rank: number | null = 3) => ({ name: 'Ahmad', total, rank, bests });

function viewFor(game: string) {
  switch (game) {
    case 'riddles':
      return { game, questions: Array.from({ length: 5 }, (_, i) => ({ emojis: `🧩${i}`, hint: 'h', options: ['a', 'b'] })) };
    case 'trivia':
      return { game, questions: [{ title: 'Off by one', language: 'java', lines: ['a', 'b'] }] };
    case 'memory':
      return { game, cards: 16 };
    default:
      throw new Error(`unknown game ${game}`);
  }
}

function runResult(overrides: Partial<Record<string, unknown>> = {}) {
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

function defaultHandler(url: string, body: Record<string, unknown>): FetchReply {
  if (url === '/api/me') return { body: FRESH };
  if (url === '/api/game/start') {
    return { body: { runId: `run-${body.game}`, view: viewFor(body.game as string) } };
  }
  return { body: { correct: true, correctAnswer: 'x', done: false } };
}

function fetchCalls(url: string) {
  return (global.fetch as jest.Mock).mock.calls
    .filter(([u]) => u === url)
    .map(([, init]) => JSON.parse(init.body) as Record<string, unknown>);
}

function startSession(name = 'Ahmad') {
  sessionStorage.setItem('playerToken', 'tok');
  sessionStorage.setItem('playerName', name);
}

/** The page starts the next unplayed game on its own. */
async function waitForGame(game: string) {
  await screen.findByTestId(`game-${game}`);
}

function finish(game: string, result: unknown) {
  act(() => {
    mockProbes[game].onDone(result);
  });
}

// Calls the game's act as the game would, capturing the outcome instead of throwing.
async function gameAct(game: string, body: unknown) {
  let response: unknown;
  let error: unknown;
  await act(async () => {
    try {
      response = await mockProbes[game].act(body);
    } catch (e) {
      error = e;
    }
  });
  return { response, error };
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  handler = defaultHandler;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const reply = handler(url, body);
    const status = reply.status ?? 200;
    return { ok: status < 300, status, json: async () => reply.body };
  }) as unknown as typeof fetch;
});

describe('Play page: session checks', () => {
  it('redirects to / when there is no session', async () => {
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('redirects to / when the token is present but the name is not', async () => {
    sessionStorage.setItem('playerToken', 'tok');
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });
});

describe('Play page: the order of play', () => {
  it('starts Emoji Riddles straight away for a player with no scores, with no games menu', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');

    expect(fetchCalls('/api/game/start')).toEqual([{ token: 'tok', game: 'riddles' }]);
    expect(screen.getByText('Game 1 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('picks up at the next unplayed game after a reload', async () => {
    startSession();
    handler = (url, body) => (url === '/api/me' ? { body: meWith({ riddles: 500 }) } : defaultHandler(url, body));
    render(<PlayPage />);
    await waitForGame('memory');
    expect(fetchCalls('/api/game/start')).toEqual([{ token: 'tok', game: 'memory' }]);
    expect(screen.getByText('Game 2 of 3')).toBeInTheDocument();
  });

  it('skips a game that scored zero, because it was played', async () => {
    startSession();
    handler = (url, body) => (url === '/api/me' ? { body: meWith({ riddles: 0, memory: 0 }, 0, 4) } : defaultHandler(url, body));
    render(<PlayPage />);
    await waitForGame('trivia');
  });

  it('shows the finish screen, and starts nothing, once all three are played', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/me' ? { body: meWith({ riddles: 500, memory: 400, trivia: 300 }, 1200, 3) } : defaultHandler(url, body);
    render(<PlayPage />);

    expect(await screen.findByText(/that's all three games, ahmad/i)).toBeInTheDocument();
    expect(screen.getByText('1200 pts')).toBeInTheDocument();
    expect(screen.getByText("You're #3 on the leaderboard")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join gdsc/i })).toBeInTheDocument();
    expect(fetchCalls('/api/game/start')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /play again/i })).not.toBeInTheDocument();
  });

  it('shows no maximum, "out of" or 1000 on the finish screen', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/me' ? { body: meWith({ riddles: 500, memory: 400, trivia: 300 }, 900, 3) } : defaultHandler(url, body);
    render(<PlayPage />);
    await screen.findByText(/that's all three games/i);
    expect(document.body.textContent ?? '').not.toMatch(/\bmax\b|out of|1000/i);
  });

  it('shows a retry when the scores cannot be loaded, and retries', async () => {
    startSession();
    let failing = true;
    handler = (url, body) => {
      if (url === '/api/me' && failing) return { status: 500, body: { error: 'Database unavailable' } };
      return defaultHandler(url, body);
    };
    render(<PlayPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitForGame('riddles');
  });
});

describe('Play page: playing a game', () => {
  it('passes riddle questions to the riddles game', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    expect(mockProbes.riddles.questions).toHaveLength(5);
  });

  it('passes the card count to Memory Match', async () => {
    startSession();
    handler = (url, body) => (url === '/api/me' ? { body: meWith({ riddles: 500 }) } : defaultHandler(url, body));
    render(<PlayPage />);
    await waitForGame('memory');
    expect(mockProbes.memory.cards).toBe(16);
  });

  it('sends the game\'s actions with the token and run id', async () => {
    startSession();
    handler = (url, body) => (url === '/api/me' ? { body: meWith({ riddles: 500 }) } : defaultHandler(url, body));
    render(<PlayPage />);
    await waitForGame('memory');

    const { response } = await gameAct('memory', { flip: 3 });

    expect(response).toEqual({ correct: true, correctAnswer: 'x', done: false });
    expect(fetchCalls('/api/game/action')).toEqual([{ token: 'tok', runId: 'run-memory', flip: 3 }]);
  });

  it('sends Emoji Riddles its whole batch of answers in one action, with no question index', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/game/action'
        ? { body: { results: [], done: true, result: runResult() } }
        : defaultHandler(url, body);
    render(<PlayPage />);
    await waitForGame('riddles');

    const { response } = await gameAct('riddles', { answers: ['a', null] });

    expect(response).toEqual({ results: [], done: true, result: runResult() });
    expect(fetchCalls('/api/game/action')).toEqual([{ token: 'tok', runId: 'run-riddles', answers: ['a', null] }]);
  });

  it('shows a friendly retry when the game cannot be started, and retries it', async () => {
    startSession();
    let failing = true;
    handler = (url, body) => {
      if (url === '/api/game/start' && failing) return { status: 500, body: { error: 'Could not pick questions' } };
      return defaultHandler(url, body);
    };
    render(<PlayPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not pick questions');
    expect(screen.getByText(/your scores so far are safe/i)).toBeInTheDocument();
    expect(screen.queryByTestId('game-riddles')).not.toBeInTheDocument();

    failing = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitForGame('riddles');
    expect(fetchCalls('/api/game/start')).toHaveLength(2);
  });

  it('keeps the game on screen when an action is refused, so the game can retry', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    handler = (url, body) =>
      url === '/api/game/action' ? { status: 429, body: { error: 'Too fast' } } : defaultHandler(url, body);

    const { error } = await gameAct('riddles', { answers: [] });

    expect((error as Error).message).toBe('Too fast');
    expect(screen.getByTestId('game-riddles')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('moves on with a notice when the run has already ended elsewhere', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    handler = (url, body) => {
      if (url === '/api/game/action') return { status: 409, body: { error: 'Run is no longer active' } };
      if (url === '/api/me') return { body: meWith({ riddles: 500 }) };
      return defaultHandler(url, body);
    };

    await gameAct('riddles', { answers: [] });

    expect(await screen.findByRole('status')).toHaveTextContent(/already finished/i);
    await waitForGame('memory');
    expect(screen.queryByTestId('game-riddles')).not.toBeInTheDocument();
  });
});

describe('Play page: result screen', () => {
  it('shows the points, with the total and rank', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');

    finish('riddles', runResult());

    expect(await screen.findByText('+350 pts')).toBeInTheDocument();
    expect(screen.getByText("Your total: 850 pts · You're #2")).toBeInTheDocument();
  });

  it('offers no replay and no way back to a games list', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    finish('riddles', runResult());

    await screen.findByText('+350 pts');
    expect(screen.queryByRole('button', { name: /play again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back to games/i })).not.toBeInTheDocument();
  });

  it('goes to the next game in order, one after another', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    finish('riddles', runResult({ gamesPlayed: ['riddles'] }));

    fireEvent.click(await screen.findByRole('button', { name: /next: memory match/i }));
    await waitForGame('memory');

    finish('memory', runResult({ game: 'memory', gamesPlayed: ['riddles', 'memory'] }));
    fireEvent.click(await screen.findByRole('button', { name: /next: tech trivia/i }));
    await waitForGame('trivia');

    expect(fetchCalls('/api/game/start').map((b) => b.game)).toEqual(['riddles', 'memory', 'trivia']);
  });

  it('shows the finish screen after the last game', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/me' ? { body: meWith({ riddles: 500, memory: 400 }) } : defaultHandler(url, body);
    render(<PlayPage />);
    await waitForGame('trivia');
    finish('trivia', runResult({ game: 'trivia', total: 1500, rank: 1, gamesPlayed: ['riddles', 'memory', 'trivia'] }));

    fireEvent.click(await screen.findByRole('button', { name: /see my results/i }));

    expect(await screen.findByText(/that's all three games/i)).toBeInTheDocument();
    expect(screen.getByText('1500 pts')).toBeInTheDocument();
    expect(screen.getByText("You're #1 on the leaderboard")).toBeInTheDocument();
    expect(fetchCalls('/api/game/start')).toHaveLength(1);
  });

  it('ignores a second completion of the same run', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    finish('riddles', runResult());
    finish('riddles', runResult({ score: 999 }));

    expect(await screen.findByText('+350 pts')).toBeInTheDocument();
    expect(screen.queryByText('+999 pts')).not.toBeInTheDocument();
  });

  it('ignores late errors from a run that already finished, such as a double tap', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    const late = gameAct('riddles', { answers: [] });
    handler = (url, body) =>
      url === '/api/game/action' ? { status: 409, body: { error: 'Run is no longer active' } } : defaultHandler(url, body);
    finish('riddles', runResult());
    await late;

    expect(await screen.findByText('+350 pts')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Play page: session expiry', () => {
  it('clears the session, leaves a notice and goes home when the score load is unauthorized', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/me' ? { status: 401, body: { error: 'Session expired' } } : defaultHandler(url, body);
    render(<PlayPage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(sessionStorage.getItem('playerToken')).toBeNull();
    expect(sessionStorage.getItem('playerName')).toBeNull();
    expect(sessionStorage.getItem('sessionNotice')).toMatch(/session has ended/i);
    expect(localStorage.getItem('gdscPlayerName')).toBeNull();
  });

  it('leaves the session when starting a game is unauthorized', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/game/start' ? { status: 401, body: { error: 'Session expired' } } : defaultHandler(url, body);
    render(<PlayPage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(sessionStorage.getItem('playerToken')).toBeNull();
    expect(sessionStorage.getItem('sessionNotice')).not.toBeNull();
  });

  it('leaves the session when an action is unauthorized', async () => {
    startSession();
    render(<PlayPage />);
    await waitForGame('riddles');
    handler = (url, body) =>
      url === '/api/game/action' ? { status: 401, body: { error: 'Session expired' } } : defaultHandler(url, body);

    await gameAct('riddles', { answers: [] });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(sessionStorage.getItem('playerName')).toBeNull();
    expect(sessionStorage.getItem('sessionNotice')).not.toBeNull();
  });
});
