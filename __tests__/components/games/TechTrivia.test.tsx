import { render, screen, fireEvent, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';
import type { AnswerResponse, FinishResponse, RunResult, TriviaView } from '@/lib/apiTypes';

const questions: TriviaView[] = [
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs', 'Global Data Science Center', 'General Developer Software Council', 'Google Design & Code'] },
  { question: 'Which Google framework builds cross-platform mobile apps?', options: ['Flutter', 'React Native', 'Angular', 'Kotlin Multiplatform'] },
  { question: "What is Google's flagship AI model family?", options: ['Gemini', 'Llama', 'Claude', 'GPT-4'] },
];

const result: RunResult = {
  game: 'trivia',
  score: 640,
  best: 640,
  improved: true,
  total: 640,
  rank: 2,
  gamesPlayed: ['trivia'],
};

const GDSC = 'Google Developer Student Clubs';
const FLUTTER = 'Flutter';
const GEMINI = 'Gemini';

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

function startGame() {
  fireEvent.click(screen.getByRole('button', { name: /start!/i }));
}

// Runs the 35 s clock one tick at a time so each expiry step can flush its promises.
async function runClockOut() {
  for (let i = 0; i < 35; i++) {
    await advance(1000);
  }
}

describe('TechTrivia', () => {
  it('renders the start screen without revealing any answer or a maximum', () => {
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start!/i })).toBeInTheDocument();
    expect(screen.getByText(/35 seconds/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/out of|max/i);
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('shows the first question after clicking Start', () => {
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();
    expect(screen.getByText(/Q1/)).toBeInTheDocument();
    expect(screen.getByText(/35s/i)).toBeInTheDocument();
    expect(option(GDSC)).toBeEnabled();
  });

  it('adds 20 points for a correct answer, locks options while pending and advances after the delay', async () => {
    const pending = deferred<AnswerResponse>();
    mockAct.mockReturnValueOnce(pending.promise);
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    fireEvent.click(option(GDSC));
    expect(option('Global Data Science Center')).toBeDisabled();
    expect(mockAct).toHaveBeenCalledWith({ answer: GDSC, q: 0 });

    await act(async () => {
      pending.resolve(reply(true, GDSC));
    });
    expect(screen.getByText('20 pts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `✓ ${GDSC}` })).toBeInTheDocument();

    await advance(600);
    expect(screen.getByText(FLUTTER)).toBeInTheDocument();
  });

  it('shows the wrong-answer banner, blocks further taps during the lockout and then advances', async () => {
    mockAct.mockResolvedValueOnce(reply(false, GDSC));
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await tap(option('Global Data Science Center'));
    expect(screen.getByText(/Wrong!/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✗ Global Data Science Center' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `✓ ${GDSC}` })).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();

    await tap(option('Google Design & Code'));
    expect(mockAct).toHaveBeenCalledTimes(1);

    await advance(1500);
    expect(screen.queryByText(/Wrong!/)).not.toBeInTheDocument();
    expect(screen.getByText(FLUTTER)).toBeInTheDocument();
  });

  it('deducts 10 per wrong answer, floors the running tally at zero and never shows a maximum', async () => {
    mockAct
      .mockResolvedValueOnce(reply(false, GDSC))
      .mockResolvedValueOnce(reply(true, FLUTTER))
      .mockResolvedValueOnce(reply(false, GEMINI));
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await tap(option('Global Data Science Center'));
    expect(screen.getByText('0 pts')).toBeInTheDocument();
    await advance(1500);

    // A wrong answer at zero leaves no debt: the next correct answer is worth the full 20.
    await tap(option(FLUTTER));
    expect(screen.getByText('20 pts')).toBeInTheDocument();
    await advance(600);

    await tap(option('Claude'));
    expect(screen.getByText('10 pts')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/out of|max/i);
  });

  it('calls onDone once with the server result when the last answer comes back done', async () => {
    mockAct
      .mockResolvedValueOnce(reply(true, GDSC))
      .mockResolvedValueOnce(reply(true, FLUTTER))
      .mockResolvedValueOnce(reply(true, GEMINI, true, { result }));
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await tap(option(GDSC));
    await advance(600);
    await tap(option(FLUTTER));
    await advance(600);
    await tap(option(GEMINI));
    expect(onDone).not.toHaveBeenCalled();

    await advance(599);
    expect(onDone).not.toHaveBeenCalled();
    await advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);

    await advance(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledTimes(3);
  });

  it('on timeout sends finish with the answers so far and calls onDone once with its result', async () => {
    mockAct
      .mockResolvedValueOnce(reply(true, GDSC))
      .mockResolvedValueOnce({ done: true, result } as FinishResponse);
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await tap(option(GDSC));
    await runClockOut();
    await advance(0);

    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct).toHaveBeenLastCalledWith({ finish: true });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('on timeout with no answers sends finish and reports nothing unanswered', async () => {
    mockAct.mockResolvedValueOnce({ done: true, result } as FinishResponse);
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await runClockOut();
    await advance(0);

    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ finish: true });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('waits for an in-flight answer when time runs out, then finishes the run', async () => {
    const pending = deferred<AnswerResponse>();
    mockAct
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ done: true, result } as FinishResponse);
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    fireEvent.click(option(GDSC));
    await runClockOut();
    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(reply(true, GDSC));
    });
    await advance(0);

    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct).toHaveBeenLastCalledWith({ finish: true });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('shows an error when finish fails on timeout and Try again finishes the run once', async () => {
    mockAct
      .mockRejectedValueOnce(new Error('Server busy'))
      .mockResolvedValueOnce({ done: true, result } as FinishResponse);
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await runClockOut();
    await advance(0);
    expect(screen.getByRole('alert')).toHaveTextContent('Server busy');
    expect(onDone).not.toHaveBeenCalled();

    await tap(screen.getByRole('button', { name: 'Try again' }));
    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct).toHaveBeenLastCalledWith({ finish: true });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('shows an error on a failed answer without advancing, and Try again re-sends the same answer', async () => {
    mockAct
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(reply(true, GDSC));
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await tap(option(GDSC));
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByText(/Q1/)).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Try again' }));
    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct).toHaveBeenLastCalledWith({ answer: GDSC, q: 0 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('20 pts')).toBeInTheDocument();

    await advance(600);
    expect(screen.getByText(FLUTTER)).toBeInTheDocument();
  });

  it('re-sends the same question index after a failed answer on a later question', async () => {
    mockAct
      .mockResolvedValueOnce(reply(true, GDSC))
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(reply(true, FLUTTER));
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await tap(option(GDSC));
    await advance(600);
    await tap(option(FLUTTER));
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByText(/Q2/)).toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Try again' }));
    expect(mockAct.mock.calls).toEqual([
      [{ answer: GDSC, q: 0 }],
      [{ answer: FLUTTER, q: 1 }],
      [{ answer: FLUTTER, q: 1 }],
    ]);
    await advance(600);
    expect(screen.getByText(GEMINI)).toBeInTheDocument();
  });
});
