import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';
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
jest.mock('@/components/games/BugHunter', () => mockGame('bugs'));
jest.mock('@/components/games/Wordle', () => mockGame('wordle'));
jest.mock('@/components/games/MemoryMatch', () => mockGame('memory'));
jest.mock('@/components/games/PasswordChallenge', () => mockGame('password'));

interface FetchReply { status?: number; body: unknown }
type FetchHandler = (url: string, body: Record<string, unknown>) => FetchReply;

let handler: FetchHandler;

const ME = { name: 'Ahmad', total: 1200, rank: 3, bests: { wordle: 700, riddles: 500 } };

function viewFor(game: string) {
  switch (game) {
    case 'riddles':
      return { game, questions: Array.from({ length: 5 }, (_, i) => ({ emojis: `🧩${i}`, hint: 'h', options: ['a', 'b'] })) };
    case 'trivia':
      return { game, questions: [{ question: 'Q', options: ['a', 'b'] }] };
    case 'bugs':
      return { game, questions: [{ title: 'Off by one', language: 'java', lines: ['a', 'b'] }] };
    case 'memory':
      return { game, cards: 16 };
    default:
      return { game };
  }
}

function runResult(overrides: Partial<Record<string, unknown>> = {}) {
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

function defaultHandler(url: string, body: Record<string, unknown>): FetchReply {
  if (url === '/api/me') return { body: ME };
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

async function openGame(title: RegExp, game: string) {
  fireEvent.click(await screen.findByRole('button', { name: title }));
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

describe('Play page: hub', () => {
  it('shows all six games with the player\'s bests, total and rank', async () => {
    startSession();
    render(<PlayPage />);

    expect(await screen.findByText('Your total: 1200 pts · 2 of 6 games played')).toBeInTheDocument();
    expect(screen.getByText("You're #3")).toBeInTheDocument();
    expect(screen.getByText('Your best: 700 pts')).toBeInTheDocument();
    expect(screen.getByText('Your best: 500 pts')).toBeInTheDocument();
    expect(screen.getAllByText('Not played yet')).toHaveLength(4);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(6);
  });

  it('shows no maximum, "out of" or 1000 anywhere on the hub', async () => {
    startSession();
    render(<PlayPage />);
    await screen.findByText('Your total: 1200 pts · 2 of 6 games played');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bmax\b|out of|1000/i);
  });

  it('asks for a rank-free message when the player has no scored game yet', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/me'
        ? { body: { name: 'Ahmad', total: 0, rank: null, bests: {} } }
        : defaultHandler(url, body);
    render(<PlayPage />);
    expect(await screen.findByText('Your total: 0 pts · 0 of 6 games played')).toBeInTheDocument();
    expect(screen.getByText('Play a game to get on the board')).toBeInTheDocument();
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
    expect(await screen.findByText('Your total: 1200 pts · 2 of 6 games played')).toBeInTheDocument();
  });
});

describe('Play page: playing a game', () => {
  it('starts the picked game and mounts it with the view from the server', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');

    expect(fetchCalls('/api/game/start')).toEqual([{ token: 'tok', game: 'wordle' }]);
    expect(mockProbes.wordle).toBeDefined();
  });

  it('passes riddle questions to the riddles game', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/emoji riddles/i, 'riddles');
    expect(mockProbes.riddles.questions).toHaveLength(5);
  });

  it('passes the card count to Memory Match', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/memory match/i, 'memory');
    expect(mockProbes.memory.cards).toBe(16);
  });

  it('sends the game\'s actions with the token and run id', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');

    const { response } = await gameAct('wordle', { guess: 'CRANE' });

    expect(response).toEqual({ correct: true, correctAnswer: 'x', done: false });
    expect(fetchCalls('/api/game/action')).toEqual([{ token: 'tok', runId: 'run-wordle', guess: 'CRANE' }]);
  });

  it('shows a friendly retry when the game cannot be started, and retries it', async () => {
    startSession();
    let failing = true;
    handler = (url, body) => {
      if (url === '/api/game/start' && failing) return { status: 500, body: { error: 'Could not pick questions' } };
      return defaultHandler(url, body);
    };
    render(<PlayPage />);
    fireEvent.click(await screen.findByRole('button', { name: /tech wordle/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not pick questions');
    expect(screen.getByText(/your other games and scores are safe/i)).toBeInTheDocument();
    expect(screen.queryByTestId('game-wordle')).not.toBeInTheDocument();

    failing = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await screen.findByTestId('game-wordle');
    expect(fetchCalls('/api/game/start')).toHaveLength(2);
  });

  it('returns to the hub from a failed start', async () => {
    startSession();
    handler = (url, body) =>
      url === '/api/game/start' ? { status: 500, body: { error: 'nope' } } : defaultHandler(url, body);
    render(<PlayPage />);
    fireEvent.click(await screen.findByRole('button', { name: /tech wordle/i }));
    fireEvent.click(await screen.findByRole('button', { name: /back to games/i }));
    expect(await screen.findByText('Play all six games')).toBeInTheDocument();
  });

  it('keeps the game on screen when an action is refused, so the game can retry', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    handler = (url, body) =>
      url === '/api/game/action' ? { status: 429, body: { error: 'Too fast' } } : defaultHandler(url, body);

    const { error } = await gameAct('wordle', { guess: 'CRANE' });

    expect((error as Error).message).toBe('Too fast');
    expect(screen.getByTestId('game-wordle')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('returns to the hub with a notice when the run has already ended elsewhere', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    handler = (url, body) =>
      url === '/api/game/action' ? { status: 409, body: { error: 'Run is no longer active' } } : defaultHandler(url, body);

    await gameAct('wordle', { guess: 'CRANE' });

    expect(await screen.findByRole('status')).toHaveTextContent(/already finished/i);
    expect(screen.getByText('Play all six games')).toBeInTheDocument();
    expect(screen.queryByTestId('game-wordle')).not.toBeInTheDocument();
  });
});

describe('Play page: result screen', () => {
  it('shows the points and new best when the run improved, with the total and rank', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');

    finish('wordle', runResult());

    expect(await screen.findByText('+350 pts')).toBeInTheDocument();
    expect(screen.getByText('🎉 New best!')).toBeInTheDocument();
    expect(screen.getByText("Your total: 850 pts · You're #2")).toBeInTheDocument();
  });

  it('shows the current best when the run did not beat it', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');

    finish('wordle', runResult({ score: 200, best: 700, improved: false }));

    expect(await screen.findByText('Your best is 700 pts.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Can you beat it?')).toBeInTheDocument();
  });

  it('goes to the next unplayed game on "Next game"', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    finish('wordle', runResult({ gamesPlayed: ['wordle'] }));

    fireEvent.click(await screen.findByRole('button', { name: /next game/i }));

    await screen.findByTestId('game-riddles');
    expect(fetchCalls('/api/game/start').map((b) => b.game)).toEqual(['wordle', 'riddles']);
  });

  it('replays the same game on "Play again" with a new run', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    finish('wordle', runResult());

    fireEvent.click(await screen.findByRole('button', { name: /play again/i }));

    await waitFor(() => expect(fetchCalls('/api/game/start')).toHaveLength(2));
    expect(fetchCalls('/api/game/start').map((b) => b.game)).toEqual(['wordle', 'wordle']);
    await screen.findByTestId('game-wordle');
  });

  it('goes back to the hub and reloads the scores on "Back to games"', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    finish('wordle', runResult());

    fireEvent.click(await screen.findByRole('button', { name: /back to games/i }));

    expect(await screen.findByText('Play all six games')).toBeInTheDocument();
    await waitFor(() => expect(fetchCalls('/api/me')).toHaveLength(2));
  });

  it('hides "Next game" once all six games are played', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    finish('wordle', runResult({ gamesPlayed: ['riddles', 'trivia', 'password', 'wordle', 'memory', 'bugs'] }));

    expect(await screen.findByText(/you've played all six games/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next game/i })).not.toBeInTheDocument();
  });

  it('ignores a second completion of the same run', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    finish('wordle', runResult());
    finish('wordle', runResult({ score: 999 }));

    expect(await screen.findByText('+350 pts')).toBeInTheDocument();
    expect(screen.queryByText('+999 pts')).not.toBeInTheDocument();
  });

  it('ignores late errors from a run that already finished, such as a double tap', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    const late = gameAct('wordle', { guess: 'CRANE' });
    handler = (url, body) =>
      url === '/api/game/action' ? { status: 409, body: { error: 'Run is no longer active' } } : defaultHandler(url, body);
    finish('wordle', runResult());
    await late;

    expect(await screen.findByText('+350 pts')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Play page: session expiry', () => {
  it('clears the session, leaves a notice and goes home when the hub load is unauthorized', async () => {
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
    render(<PlayPage />);
    await screen.findByText('Your total: 1200 pts · 2 of 6 games played');
    handler = (url, body) =>
      url === '/api/game/start' ? { status: 401, body: { error: 'Session expired' } } : defaultHandler(url, body);

    fireEvent.click(screen.getByRole('button', { name: /tech wordle/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(sessionStorage.getItem('playerToken')).toBeNull();
    expect(sessionStorage.getItem('sessionNotice')).not.toBeNull();
  });

  it('leaves the session when an action is unauthorized', async () => {
    startSession();
    render(<PlayPage />);
    await openGame(/tech wordle/i, 'wordle');
    handler = (url, body) =>
      url === '/api/game/action' ? { status: 401, body: { error: 'Session expired' } } : defaultHandler(url, body);

    await gameAct('wordle', { guess: 'CRANE' });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(sessionStorage.getItem('playerName')).toBeNull();
    expect(sessionStorage.getItem('sessionNotice')).not.toBeNull();
  });
});
