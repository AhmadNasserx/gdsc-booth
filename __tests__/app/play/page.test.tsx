/* eslint-disable @typescript-eslint/no-require-imports */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import PlayPage from '@/app/play/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

// Stand-in games: each renders one button that completes with a fixed answer,
// so these tests cover the page's flow rather than the games themselves.
jest.mock('@/components/games/EmojiRiddles', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ questions, onComplete }: { questions: unknown[]; onComplete: (a: string[]) => void }) =>
      createElement('button', { type: 'button', onClick: () => onComplete(['Web Crawler', 'Docker', 'SSL/TLS', 'Python']) },
        `mock-finish-riddles (${questions.length})`),
  };
});
jest.mock('@/components/games/TechTrivia', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ onComplete }: { onComplete: (a: { answer: string }[]) => void }) =>
      createElement('button', { type: 'button', onClick: () => onComplete([{ answer: 'GDSC' }]) }, 'mock-finish-trivia'),
  };
});
jest.mock('@/components/games/PasswordChallenge', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ onComplete }: { onComplete: (p: string) => void }) =>
      createElement('button', { type: 'button', onClick: () => onComplete('Tr0ub4dor&3-horse') }, 'mock-finish-password'),
  };
});
jest.mock('@/components/games/Wordle', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ word, hint, onComplete }: { word: string; hint: string; onComplete: (g: string[]) => void }) =>
      createElement('button', { type: 'button', onClick: () => onComplete(['SHELL', word]) },
        `mock-finish-wordle ${word} ${hint}`),
  };
});
jest.mock('@/components/games/MemoryMatch', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ onComplete }: { onComplete: (r: { moves: number; seconds: number }) => void }) =>
      createElement('button', { type: 'button', onClick: () => onComplete({ moves: 12, seconds: 40 }) }, 'mock-finish-memory'),
  };
});
jest.mock('@/components/games/BugHunter', () => {
  const { createElement } = require('react');
  return {
    __esModule: true,
    default: ({ questions, onComplete }: { questions: unknown[]; onComplete: (a: number[]) => void }) =>
      createElement('button', { type: 'button', onClick: () => onComplete([1, 2, 3, 0, 4]) },
        `mock-finish-bugs (${questions.length})`),
  };
});

const questionsPackage = {
  riddles: Array.from({ length: 5 }, (_, i) => ({
    emojis: `🧩${i}`, hint: `hint ${i}`, options: ['Web Crawler', 'Docker'], answer: 'Web Crawler',
  })),
  trivia: [{ question: 'What does GDSC stand for?', options: ['Google Developer Student Clubs', 'Other'], answer: 'Google Developer Student Clubs' }],
  bugs: [{ title: 'Off by one', language: 'js', lines: ['a', 'b'], answer: 0, explanation: 'e' }],
  wordleWord: 'CRANE',
  wordleHint: 'Terminal interface',
};

function startSession(game?: string) {
  sessionStorage.setItem('playerToken', 'tok');
  sessionStorage.setItem('playerName', 'Ahmad');
  sessionStorage.setItem('playerQuestions', JSON.stringify(questionsPackage));
  if (game) sessionStorage.setItem('playerGame', game);
}

function tabButton(label: RegExp) {
  return within(screen.getByRole('navigation', { name: 'Games' })).getByRole('button', { name: label });
}

let idCounter = 0;

beforeAll(() => {
  // jsdom does not always provide randomUUID; give each submission a distinct id.
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => `sub-${++idCounter}` },
    configurable: true,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  global.fetch = jest.fn();
  idCounter = 0;
});

describe('Play Page: session checks', () => {
  it('redirects to / when no session in sessionStorage', async () => {
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('redirects to / when playerQuestions is missing', async () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('redirects to / for a session saved before the bug pool existed', async () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    sessionStorage.setItem('playerQuestions', JSON.stringify({
      riddles: questionsPackage.riddles,
      trivia: questionsPackage.trivia,
      binaryChar: '42',
      wordleWord: 'CRANE',
      wordleHint: 'hint',
    }));
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('Pick your challenge')).not.toBeInTheDocument();
  });
});

describe('Play Page: picking a game', () => {
  it('shows the picker when no game has been picked yet', () => {
    startSession();
    render(<PlayPage />);
    expect(screen.getByRole('heading', { name: 'Pick your challenge' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Games' })).not.toBeInTheDocument();
  });

  it('shows the picker and clears the stored game when it is not a valid tab', () => {
    startSession('binary');
    render(<PlayPage />);
    expect(screen.getByRole('heading', { name: 'Pick your challenge' })).toBeInTheDocument();
    expect(sessionStorage.getItem('playerGame')).toBeNull();
  });

  it('stores the pick in sessionStorage and marks that game as scored', () => {
    startSession();
    render(<PlayPage />);
    fireEvent.click(screen.getByRole('button', { name: /emoji riddles/i }));

    expect(sessionStorage.getItem('playerGame')).toBe('riddles');
    expect(screen.getByText('⭐ Scored game')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /emoji riddles \(your scored game\)/i })).toHaveTextContent('⭐');
    expect(screen.getByText('mock-finish-riddles (5)')).toBeInTheDocument();
  });

  it('restores the stored pick on mount and opens that game', () => {
    startSession('memory');
    render(<PlayPage />);
    expect(screen.getByText('⭐ Scored game')).toBeInTheDocument();
    expect(screen.getByText('mock-finish-memory')).toBeInTheDocument();
  });

  it('shows all six tabs', () => {
    startSession('riddles');
    render(<PlayPage />);
    const nav = screen.getByRole('navigation', { name: 'Games' });
    expect(within(nav).getAllByRole('button')).toHaveLength(6);
  });

  it('lets the player change the pick before completing the scored game', () => {
    startSession();
    render(<PlayPage />);
    fireEvent.click(screen.getByRole('button', { name: /tech trivia/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Change pick' }));

    expect(screen.getByRole('heading', { name: 'Pick your challenge' })).toBeInTheDocument();
    expect(sessionStorage.getItem('playerGame')).toBeNull();
  });
});

describe('Play Page: practice and scored tabs', () => {
  it('shows the practice banner on a tab that is not the pick', () => {
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(tabButton(/trivia/i));
    expect(screen.getByText("🎮 Practice — doesn't count toward your score")).toBeInTheDocument();
    expect(screen.queryByText('⭐ Scored game')).not.toBeInTheDocument();
  });

  it('shows the result card after a practice game and "Play again" remounts it', () => {
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(tabButton(/trivia/i));
    fireEvent.click(screen.getByText('mock-finish-trivia'));

    expect(screen.getByText('Nice! Practice complete')).toBeInTheDocument();
    expect(screen.queryByText('mock-finish-trivia')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByText('mock-finish-trivia')).toBeInTheDocument();
    expect(screen.queryByText('Nice! Practice complete')).not.toBeInTheDocument();
  });

  it('never submits practice answers', () => {
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(tabButton(/trivia/i));
    fireEvent.click(screen.getByText('mock-finish-trivia'));
    fireEvent.click(tabButton(/password/i));
    fireEvent.click(screen.getByText('mock-finish-password'));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('bottom button jumps to the scored game until it is finished', () => {
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(tabButton(/trivia/i));

    const jump = screen.getByRole('button', { name: 'Finish your ⭐ Emoji Riddles to submit' });
    expect(screen.queryByRole('button', { name: 'Submit Score →' })).not.toBeInTheDocument();
    fireEvent.click(jump);
    expect(screen.getByText('⭐ Scored game')).toBeInTheDocument();
    expect(screen.getByText('mock-finish-riddles (5)')).toBeInTheDocument();
  });

  it('locks the scored answer after completion and shows the submit button', () => {
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(screen.getByText('mock-finish-riddles (5)'));

    expect(screen.getByText('Game complete!')).toBeInTheDocument();
    expect(screen.queryByText('mock-finish-riddles (5)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit Score →' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Change pick' })).not.toBeInTheDocument();
  });

  it('shows a check on the scored tab once it is completed', () => {
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(screen.getByText('mock-finish-riddles (5)'));
    expect(within(screen.getByRole('navigation', { name: 'Games' })).getByText('✓')).toBeInTheDocument();
  });
});

describe('Play Page: submitting', () => {
  it('posts { token, submissionId, game, answer } and shows the finish screen', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rank: 3, total: 640, game: 'riddles' }),
    });
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(screen.getByText('mock-finish-riddles (5)'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Score →' }));

    await screen.findByText('640');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/score');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      token: 'tok',
      submissionId: 'sub-1',
      game: 'riddles',
      answer: ['Web Crawler', 'Docker', 'SSL/TLS', 'Python'],
    });
    expect(screen.getByText('Emoji Riddles')).toBeInTheDocument();
    expect(screen.getByText('/ 1000 pts')).toBeInTheDocument();
  });

  it('submits the answer of the picked game, not of another game', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rank: 1, total: 900, game: 'memory' }),
    });
    startSession('memory');
    render(<PlayPage />);
    fireEvent.click(tabButton(/trivia/i));
    fireEvent.click(screen.getByText('mock-finish-trivia'));
    fireEvent.click(tabButton(/memory/i));
    fireEvent.click(screen.getByText('mock-finish-memory'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Score →' }));

    await screen.findByText('900');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      token: 'tok',
      submissionId: 'sub-1',
      game: 'memory',
      answer: { moves: 12, seconds: 40 },
    });
  });

  it('shows the server error and keeps the same submissionId for a retry', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Session expired' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rank: 2, total: 500, game: 'riddles' }) });
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(screen.getByText('mock-finish-riddles (5)'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Score →' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Session expired');
    fireEvent.click(screen.getByRole('button', { name: 'Submit Score →' }));
    await screen.findByText('500');

    const first = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const second = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(second.submissionId).toBe(first.submissionId);
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolve: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    startSession('riddles');
    render(<PlayPage />);
    fireEvent.click(screen.getByText('mock-finish-riddles (5)'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Score →' }));

    const busy = await screen.findByRole('button', { name: 'Submitting…' });
    expect(busy).toBeDisabled();
    resolve({ ok: true, json: async () => ({ rank: 1, total: 100, game: 'riddles' }) });
    await screen.findByText('100');
  });
});
