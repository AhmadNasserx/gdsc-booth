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

describe('EmojiRiddles with a check per pick', () => {
  const mockCheck = jest.fn();

  beforeEach(() => {
    mockCheck.mockReset();
  });

  // Lets the promise chain of a check (queue, reply, state update) run to the end.
  async function settle() {
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
  }

  async function tapAndSettle(label: string) {
    await tap(option(label));
    await settle();
  }

  const isQuestion = (n: number) => screen.getByText(new RegExp(`Question ${n} of 4`, 'i'));

  it('shows the pick and locks the options at once, and sends the check with its index and option', async () => {
    mockCheck.mockReturnValueOnce(new Promise(() => {}));
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tap(option('Bug Bounty'));

    expect(option('Bug Bounty')).toHaveClass('anim-pop');
    expect(option('Web Crawler')).toBeDisabled();
    expect(option('Bug Bounty')).toBeDisabled();
    expect(mockCheck).toHaveBeenCalledTimes(1);
    expect(mockCheck).toHaveBeenCalledWith({ check: { index: 0, answer: 'Bug Bounty' } });
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('turns a right pick green and moves on 600ms after the verdict, not before', async () => {
    mockCheck.mockResolvedValueOnce({ index: 0, correct: true, correctAnswer: 'Web Crawler' });
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tapAndSettle('Web Crawler');

    expect(option('Web Crawler')).toHaveClass('border-[#34A853]', 'anim-pop', 'anim-flash-green');
    expect(option('Web Crawler')).not.toHaveClass('anim-shake');
    expect(screen.getByRole('status')).toHaveTextContent('Correct');

    await advance(599);
    expect(isQuestion(1)).toBeInTheDocument();
    await advance(1);
    expect(isQuestion(2)).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('turns a wrong pick red with the shake, and highlights the right answer green', async () => {
    mockCheck.mockResolvedValueOnce({ index: 0, correct: false, correctAnswer: 'Web Crawler' });
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tapAndSettle('Bug Bounty');

    expect(option('Bug Bounty')).toHaveClass('anim-shake', 'anim-flash-red', 'border-[#EA4335]');
    expect(option('Web Crawler')).toHaveClass('border-[#34A853]', 'bg-[#E6F4EA]');
    expect(option('Docker')).toHaveClass('text-[#9AA0A6]');
    expect(screen.getByRole('status')).toHaveTextContent('Not quite. The answer is Web Crawler.');
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('moves on after 600ms from a wrong verdict, and sends the batch only at the end', async () => {
    mockCheck.mockResolvedValue({ index: 0, correct: false, correctAnswer: 'Web Crawler' });
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tapAndSettle('Bug Bounty');
    await advance(600);
    expect(isQuestion(2)).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('gives a slow verdict up after 1200ms, moves on with the neutral look and ignores the late reply', async () => {
    const late = deferred<unknown>();
    mockCheck.mockReturnValueOnce(late.promise);
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tap(option('Bug Bounty'));
    await advance(1199);
    expect(isQuestion(1)).toBeInTheDocument();
    await advance(1);
    expect(isQuestion(2)).toBeInTheDocument();

    await act(async () => {
      late.resolve({ index: 0, correct: false, correctAnswer: 'Web Crawler' });
    });
    await settle();
    // The late reply is for question 1, so question 2 keeps its neutral look.
    expect(isQuestion(2)).toBeInTheDocument();
    expect(option('Docker').className).not.toMatch(/anim-shake|anim-flash|border-\[#34A853\]|border-\[#EA4335\]/);
    expect(screen.getByRole('status')).toHaveTextContent(/^$/);
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('a check that fails shows the neutral look, moves on after 250ms, and the answer still goes in the batch', async () => {
    mockCheck.mockRejectedValue(new Error('Server busy'));
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tapAndSettle('Web Crawler');
    expect(option('Web Crawler')).toHaveClass('anim-pop');
    expect(option('Web Crawler')).not.toHaveClass('anim-flash-green');
    expect(option('Web Crawler')).not.toHaveClass('anim-flash-red');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await advance(249);
    expect(isQuestion(1)).toBeInTheDocument();
    await advance(1);
    expect(isQuestion(2)).toBeInTheDocument();

    for (const answer of ['Docker', 'SSL/TLS', 'Python']) {
      await pickAndAdvance(answer);
    }
    expect(mockAct).toHaveBeenCalledWith({ answers: ANSWERS });
  });

  it('a reply without a verdict in it is treated as a failed check', async () => {
    mockCheck.mockResolvedValueOnce({ index: 0 });
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tapAndSettle('Web Crawler');
    expect(option('Web Crawler')).not.toHaveClass('anim-flash-green');
    await advance(250);
    expect(isQuestion(2)).toBeInTheDocument();
  });

  it('a check that throws on the call itself does not block the game', async () => {
    mockCheck.mockImplementation(() => {
      throw new Error('bad call');
    });
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tapAndSettle('Web Crawler');
    await advance(250);
    expect(isQuestion(2)).toBeInTheDocument();
  });

  it('sends each check only after the one before it has settled, so the server sees the questions in order', async () => {
    const first = deferred<unknown>();
    mockCheck.mockReturnValueOnce(first.promise).mockReturnValueOnce(new Promise(() => {}));
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tap(option('Web Crawler'));
    // The first verdict is slow: give up on it, then answer the next question while it is still out.
    await advance(1200);
    await tap(option('Docker'));
    await settle();
    expect(mockCheck).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({ index: 0, correct: true, correctAnswer: 'Web Crawler' });
    });
    await settle();
    expect(mockCheck).toHaveBeenCalledTimes(2);
    expect(mockCheck).toHaveBeenLastCalledWith({ check: { index: 1, answer: 'Docker' } });
  });

  it('gives a buzz on a verdict where vibration is available, and not where it is not', async () => {
    const vibrate = jest.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    try {
      mockCheck.mockResolvedValueOnce({ index: 0, correct: true, correctAnswer: 'Web Crawler' });
      mockCheck.mockResolvedValueOnce({ index: 1, correct: false, correctAnswer: 'Docker' });
      render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

      await tapAndSettle('Web Crawler');
      expect(vibrate).toHaveBeenLastCalledWith(30);
      await advance(600);
      await tapAndSettle('GitLab');
      expect(vibrate).toHaveBeenLastCalledWith(80);
    } finally {
      delete (navigator as unknown as { vibrate?: unknown }).vibrate;
    }
  });

  it('a verdict that arrives after the component has gone is ignored', async () => {
    const late = deferred<unknown>();
    mockCheck.mockReturnValueOnce(late.promise);
    const { unmount } = render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    await tap(option('Web Crawler'));
    unmount();
    await act(async () => {
      late.resolve({ index: 0, correct: true, correctAnswer: 'Web Crawler' });
    });
    await advance(5000);
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('plays a whole round with checks and sends the final batch once', async () => {
    mockCheck.mockImplementation(async ({ check: { index, answer } }: { check: { index: number; answer: string } }) => ({
      index,
      correct: answer === ANSWERS[index],
      correctAnswer: ANSWERS[index],
    }));
    mockAct.mockResolvedValueOnce(batch(ANSWERS.map((a) => ({ answered: true, correct: true, correctAnswer: a }))));
    render(<EmojiRiddles questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);

    for (const answer of ANSWERS) {
      await tapAndSettle(answer);
      await advance(600);
    }

    expect(mockCheck).toHaveBeenCalledTimes(4);
    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: ANSWERS });
    expect(screen.getByRole('heading', { name: 'Your answers' })).toBeInTheDocument();
  });
});
