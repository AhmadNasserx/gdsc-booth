import { render, screen, fireEvent, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';
import type { BatchResponse, ReviewItem, RunResult, TriviaView } from '@/lib/apiTypes';

const questions: TriviaView[] = [
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs', 'Global Data Science Center', 'General Developer Software Council', 'Google Design & Code'] },
  { question: 'Which Google framework builds cross-platform mobile apps?', options: ['Flutter', 'React Native', 'Angular', 'Kotlin Multiplatform'] },
  { question: "What is Google's flagship AI model family?", options: ['Gemini', 'Llama', 'Mistral', 'GPT-4'] },
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
const ANGULAR = 'Angular';
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

const batchReply = (results: ReviewItem[], runResult: RunResult = result): BatchResponse => ({
  results,
  done: true,
  result: runResult,
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

// Option labels carry no prefix, so match the label exactly.
const option = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`${label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) });

function startGame() {
  fireEvent.click(screen.getByRole('button', { name: /start!/i }));
}

// Picks an option for the current question and lets the short flash finish.
async function pickAndAdvance(label: string) {
  await tap(option(label));
  await advance(200);
}

// Runs the 35 s clock one tick at a time so each expiry step can flush its promises.
async function runClockOut() {
  for (let i = 0; i < 35; i++) {
    await advance(1000);
  }
}

describe('TechTrivia', () => {
  it('renders the start screen without a maximum, points or answers', () => {
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start!/i })).toBeInTheDocument();
    expect(screen.getByText(/35 seconds/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/out of|max|pts/i);
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('shows the first question with the countdown after clicking Start', () => {
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();
    expect(screen.getByText(/Q1/)).toBeInTheDocument();
    expect(screen.getByText(/35s/i)).toBeInTheDocument();
    expect(option(GDSC)).toBeEnabled();
  });

  it('locks in a pick with a neutral flash, without a network call or a right/wrong reveal', async () => {
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await tap(option(GDSC));
    expect(screen.getByText('Locked in')).toBeInTheDocument();
    expect(option(GDSC)).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/[✓✗]/);
    expect(document.body.textContent).not.toMatch(/Wrong|Correct/);
    expect(mockAct).not.toHaveBeenCalled();

    await advance(200);
    expect(screen.queryByText('Locked in')).not.toBeInTheDocument();
    expect(screen.getByText(FLUTTER)).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('ignores taps on other options during the flash, so the first pick stands', async () => {
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await tap(option('Global Data Science Center'));
    await tap(option(GDSC));
    expect(option(GDSC)).toBeDisabled();
    await advance(200);

    await pickAndAdvance(FLUTTER);
    await pickAndAdvance(GEMINI);
    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: ['Global Data Science Center', FLUTTER, GEMINI] });
  });

  it('sends all picks once, in question order, when the last question is answered', async () => {
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await pickAndAdvance(GDSC);
    await pickAndAdvance(ANGULAR);
    expect(mockAct).not.toHaveBeenCalled();

    await tap(option(GEMINI));
    await advance(200);
    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: [GDSC, ANGULAR, GEMINI] });
    expect(screen.getByText('Checking your answers…')).toBeInTheDocument();
  });

  it('shows a review with a mark and the correct answer per question, then calls onDone once from Continue', async () => {
    mockAct.mockResolvedValueOnce(
      batchReply([
        { answered: true, correct: true, correctAnswer: GDSC },
        { answered: true, correct: false, correctAnswer: FLUTTER },
        { answered: true, correct: true, correctAnswer: GEMINI },
      ]),
    );
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await pickAndAdvance(GDSC);
    await pickAndAdvance(ANGULAR);
    await tap(option(GEMINI));
    await advance(200);

    expect(screen.getByText('Your answers')).toBeInTheDocument();
    expect(screen.getByText('2 correct')).toBeInTheDocument();
    expect(screen.getByText(`Correct answer: ${GDSC}`)).toBeInTheDocument();
    expect(screen.getByText(`Your answer: ${ANGULAR}`)).toBeInTheDocument();
    expect(screen.getByText(`Correct answer: ${FLUTTER}`)).toBeInTheDocument();
    expect(screen.getByText('Wrong:', { exact: false })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/out of|max|pts/i);
    expect(onDone).not.toHaveBeenCalled();

    const cont = screen.getByRole('button', { name: 'Continue' });
    await tap(cont);
    await tap(cont);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
    expect(mockAct).toHaveBeenCalledTimes(1);
  });

  it('on timeout sends the answers so far with nulls for the rest, once', async () => {
    mockAct.mockResolvedValueOnce(
      batchReply([
        { answered: true, correct: true, correctAnswer: GDSC },
        { answered: false, correct: false, correctAnswer: FLUTTER },
        { answered: false, correct: false, correctAnswer: GEMINI },
      ]),
    );
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await pickAndAdvance(GDSC);
    await runClockOut();
    await advance(0);

    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: [GDSC, null, null] });
    expect(screen.getByText('1 correct · 2 unanswered')).toBeInTheDocument();
    expect(screen.getAllByText('No answer', { exact: false })).toHaveLength(2);
    expect(onDone).not.toHaveBeenCalled();

    await tap(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('on timeout with no picks sends an all-null batch', async () => {
    mockAct.mockResolvedValueOnce(
      batchReply([
        { answered: false, correct: false, correctAnswer: GDSC },
        { answered: false, correct: false, correctAnswer: FLUTTER },
        { answered: false, correct: false, correctAnswer: GEMINI },
      ]),
    );
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await runClockOut();
    await advance(0);

    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: [null, null, null] });
  });

  it('keeps a pick made just before time runs out and sends the round once', async () => {
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    // Tick the clock one second per call (effects flush between calls), then pick 100 ms before
    // the last tick: the 200 ms flash is still running when time expires.
    for (let i = 0; i < 34; i++) {
      await advance(1000);
    }
    await advance(900);
    await tap(option(GDSC));
    await advance(100);
    await advance(5000);

    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: [GDSC, null, null] });
  });

  it('waits for the batch to come back before showing the review', async () => {
    const pending = deferred<BatchResponse>();
    mockAct.mockReturnValueOnce(pending.promise);
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await pickAndAdvance(GDSC);
    await pickAndAdvance(FLUTTER);
    await pickAndAdvance(GEMINI);
    expect(screen.getByRole('status')).toHaveTextContent('Checking your answers…');

    await act(async () => {
      pending.resolve(
        batchReply([
          { answered: true, correct: true, correctAnswer: GDSC },
          { answered: true, correct: true, correctAnswer: FLUTTER },
          { answered: true, correct: true, correctAnswer: GEMINI },
        ]),
      );
    });
    expect(screen.getByText('3 correct')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the error on a failed batch and Try again re-sends the identical answers', async () => {
    mockAct
      .mockRejectedValueOnce(new Error('Server busy'))
      .mockResolvedValueOnce(
        batchReply([
          { answered: true, correct: true, correctAnswer: GDSC },
          { answered: true, correct: true, correctAnswer: FLUTTER },
          { answered: true, correct: true, correctAnswer: GEMINI },
        ]),
      );
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await pickAndAdvance(GDSC);
    await pickAndAdvance(FLUTTER);
    await pickAndAdvance(GEMINI);

    expect(screen.getByRole('alert')).toHaveTextContent('Server busy');
    expect(onDone).not.toHaveBeenCalled();
    expect(mockAct).toHaveBeenCalledTimes(1);

    await tap(screen.getByRole('button', { name: 'Try again' }));
    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct.mock.calls[1]).toEqual(mockAct.mock.calls[0]);
    expect(mockAct).toHaveBeenLastCalledWith({ answers: [GDSC, FLUTTER, GEMINI] });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('3 correct')).toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('rejects a malformed batch response as an error instead of showing a broken review', async () => {
    mockAct.mockResolvedValueOnce({ done: true } as unknown as BatchResponse);
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} onDone={onDone} />);
    startGame();

    await runClockOut();
    await advance(0);

    expect(screen.getByRole('alert')).toHaveTextContent('Unexpected response from the server.');
    expect(onDone).not.toHaveBeenCalled();
  });
});
