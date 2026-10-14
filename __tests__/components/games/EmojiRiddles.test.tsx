import { render, screen, fireEvent, act } from '@testing-library/react';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import type { BatchResponse, ReviewItem, RiddleView, RunResult } from '@/lib/apiTypes';

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
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const batch = (results: ReviewItem[]): BatchResponse => ({ results, done: true, result });

const ANSWERS = ['Web Crawler', 'Docker', 'SSL/TLS', 'Python'];

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

const option = (label: string) => screen.getByRole('button', { name: label });

// Picks an option and waits out the neutral transition.
async function pickAndAdvance(label: string) {
  await tap(option(label));
  await advance(250);
}

async function playAllQuestions() {
  for (const answer of ANSWERS) {
    await pickAndAdvance(answer);
  }
}

describe('EmojiRiddles', () => {
  it('renders the first question without revealing anything and never calls act', () => {
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
    expect(screen.getByText('Hint: Scrapes and indexes the web')).toBeInTheDocument();
    expect(option('Web Crawler')).toBeEnabled();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('advances to the next question after a short transition without calling act', async () => {
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(option('Bug Bounty'));

    expect(mockAct).not.toHaveBeenCalled();
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
    expect(screen.queryByText(/✓|✗|\bpts\b|correct|wrong/i)).not.toBeInTheDocument();

    await advance(249);
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();

    await advance(1);
    expect(screen.getByText(/Question 2 of 4/i)).toBeInTheDocument();
    expect(screen.getByText('Hint: Containerization platform')).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('locks the question during the transition so a second tap cannot skip a question', async () => {
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(option('Web Crawler'));
    expect(option('Docker')).toBeDisabled();
    await tap(option('Docker'));
    await advance(250);

    expect(screen.getByText(/Question 2 of 4/i)).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('sends all answers once, in question order, after the last pick and shows a checking state', async () => {
    const pending = deferred<BatchResponse>();
    mockAct.mockReturnValueOnce(pending.promise);
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await playAllQuestions();

    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: ANSWERS });
    expect(screen.getByText('Checking your answers…')).toBeInTheDocument();

    await advance(5000);
    expect(mockAct).toHaveBeenCalledTimes(1);
  });

  it('shows a review with mixed correct and incorrect answers after submission', async () => {
    mockAct.mockResolvedValueOnce(
      batch([
        { answered: true, correct: true, correctAnswer: 'Web Crawler' },
        { answered: true, correct: false, correctAnswer: 'Docker' },
        { answered: true, correct: true, correctAnswer: 'SSL/TLS' },
        { answered: true, correct: false, correctAnswer: 'Python', explanation: 'Python is the scripting language.' },
      ]),
    );
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await pickAndAdvance('Web Crawler');
    await pickAndAdvance('GitLab');
    await pickAndAdvance('SSL/TLS');
    await tap(option('Rust'));
    await advance(250);

    expect(screen.getByRole('heading', { name: 'Your answers' })).toBeInTheDocument();
    expect(screen.getAllByText('Correct')).toHaveLength(2);
    expect(screen.getAllByText('Incorrect')).toHaveLength(2);
    expect(screen.getByText('Your pick: Web Crawler')).toBeInTheDocument();
    expect(screen.getByText('Your pick: GitLab')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: Docker')).toBeInTheDocument();
    expect(screen.getByText('Your pick: Rust')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: Python')).toBeInTheDocument();
    expect(screen.getByText('Python is the scripting language.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('shows the error inline and re-sends identical answers on Try again without losing them', async () => {
    mockAct
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(batch(ANSWERS.map((a) => ({ answered: true, correct: true, correctAnswer: a }))));
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);

    await playAllQuestions();

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(screen.queryByRole('heading', { name: 'Your answers' })).not.toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Try again' }));

    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct.mock.calls[1]).toEqual(mockAct.mock.calls[0]);
    expect(mockAct).toHaveBeenLastCalledWith({ answers: ANSWERS });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your answers' })).toBeInTheDocument();
  });

  it('calls onDone exactly once with the result when Continue is pressed', async () => {
    mockAct.mockResolvedValueOnce(batch(ANSWERS.map((a) => ({ answered: true, correct: true, correctAnswer: a }))));
    const onDone = jest.fn();
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={onDone} />);

    await playAllQuestions();
    const cont = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(cont);
    fireEvent.click(cont);
    await advance(5000);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
    expect(mockAct).toHaveBeenCalledTimes(1);
  });

  it('never shows correctness, points or a maximum before submission', async () => {
    render(<EmojiRiddles questions={questions} act={mockAct} onDone={jest.fn()} />);
    const hidden = /✓|✗|\bpts\b|correct|incorrect|wrong|\/\s*\d/i;

    for (const answer of ANSWERS.slice(0, 3)) {
      await tap(option(answer));
      expect(document.body.textContent).not.toMatch(hidden);
      await advance(250);
      expect(document.body.textContent).not.toMatch(hidden);
    }
    expect(mockAct).not.toHaveBeenCalled();
  });
});
