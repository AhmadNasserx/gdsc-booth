import { render, screen, fireEvent, act } from '@testing-library/react';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import type { AnswerResponse, RiddleView, RunResult } from '@/lib/apiTypes';

const questions: RiddleView[] = [
  { emojis: '🕷️ 🌐', hint: 'Scrapes and indexes the web', options: ['Web Crawler', 'Bug Bounty', 'Docker', 'Firewall'] },
  { emojis: '📦 🔄 🚢', hint: 'Containerization platform', options: ['Kubernetes', 'GitLab', 'Docker', 'Linux'] },
  { emojis: '🔑 🔒 📜', hint: 'Encrypts web communication', options: ['SSL/TLS', 'DNS', 'HTTP', 'VPN'] },
  { emojis: '🐍 💻 ⚡', hint: 'Popular scripting language', options: ['Python', 'C++', 'JavaScript', 'Rust'] },
];

const result: RunResult = {
  game: 'riddles',
  score: 1180,
  best: 1180,
  improved: true,
  total: 1180,
  rank: 1,
  gamesPlayed: ['riddles'],
};

const mockAct = jest.fn();

jest.useFakeTimers();

beforeEach(() => {
  mockAct.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const reply = (correct: boolean, correctAnswer: string, done = false, extra: Partial<AnswerResponse> = {}): AnswerResponse => ({
  correct,
  correctAnswer,
  done,
  ...extra,
});

async function tap(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

// Option labels gain a "✓ " or "✗ " prefix once revealed, so match the label at the end.
const option = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`${label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) });

describe('EmojiRiddles', () => {
  it('renders the first question without revealing any answer', () => {
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
    expect(screen.getByText('Hint: Scrapes and indexes the web')).toBeInTheDocument();
    expect(option('Web Crawler')).toBeEnabled();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('reveals a correct answer from the server, adds points and advances after the feedback delay', async () => {
    mockAct.mockResolvedValueOnce(reply(true, 'Web Crawler'));
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(option('Web Crawler'));

    expect(mockAct).toHaveBeenCalledWith({ answer: 'Web Crawler' });
    expect(screen.getByRole('button', { name: '✓ Web Crawler' })).toBeDisabled();
    expect(screen.getByText('40 pts')).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();

    await advance(1100);
    expect(screen.getByText(/Question 2 of 4/i)).toBeInTheDocument();
  });

  it('reveals the correct option after a wrong pick and adds no points', async () => {
    mockAct.mockResolvedValueOnce(reply(false, 'Web Crawler'));
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(option('Bug Bounty'));

    expect(screen.getByRole('button', { name: '✗ Bug Bounty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✓ Web Crawler' })).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('shows an inline error without advancing and re-sends the same answer on Try again', async () => {
    mockAct
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(reply(true, 'Web Crawler'));
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(option('Web Crawler'));

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Try again' }));

    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct).toHaveBeenLastCalledWith({ answer: 'Web Crawler' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('40 pts')).toBeInTheDocument();

    await advance(1100);
    expect(screen.getByText(/Question 2 of 4/i)).toBeInTheDocument();
  });

  it('disables options while a request is pending and ignores repeat taps', async () => {
    const pending = deferred<AnswerResponse>();
    mockAct.mockReturnValueOnce(pending.promise);
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(option('Web Crawler'));
    expect(option('Bug Bounty')).toBeDisabled();
    await tap(option('Bug Bounty'));
    await tap(option('Web Crawler'));
    expect(mockAct).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(reply(true, 'Web Crawler'));
    });
    expect(screen.getByRole('button', { name: '✓ Web Crawler' })).toBeInTheDocument();
  });

  it('calls onDone once with the final result after the last answer feedback', async () => {
    mockAct
      .mockResolvedValueOnce(reply(true, 'Web Crawler'))
      .mockResolvedValueOnce(reply(true, 'Docker'))
      .mockResolvedValueOnce(reply(true, 'SSL/TLS'))
      .mockResolvedValueOnce(reply(true, 'Python', true, { result }));
    const onDone = jest.fn();
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={onDone} />);

    await tap(option('Web Crawler'));
    await advance(1100);
    await tap(option('Docker'));
    await advance(1100);
    await tap(option('SSL/TLS'));
    await advance(1100);

    await tap(option('Python'));
    expect(onDone).not.toHaveBeenCalled();

    await advance(1099);
    expect(onDone).not.toHaveBeenCalled();
    await advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);

    await advance(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledTimes(4);
  });
});
