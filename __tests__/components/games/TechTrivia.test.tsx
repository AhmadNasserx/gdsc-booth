import { render, screen, fireEvent, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';
import type { BatchResponse, ReviewItem, RunResult, TriviaView } from '@/lib/apiTypes';
import { feedback } from '@/lib/feedback';

jest.mock('@/lib/feedback', () => ({ feedback: jest.fn() }));

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
  jest.mocked(feedback).mockClear();
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

  it('plays the tap sound when an option is picked', async () => {
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();

    await tap(option(GDSC));

    expect(feedback).toHaveBeenCalledWith('tap');
  });

  it('ticks once a second over the last ten seconds, and not before', async () => {
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<TechTrivia questions={questions} act={mockAct} onDone={jest.fn()} />);
    startGame();
    const ticks = () => jest.mocked(feedback).mock.calls.filter(([kind]) => kind === 'tick').length;

    // 35 s down to 11 s: no tick yet.
    for (let i = 0; i < 24; i++) {
      await advance(1000);
    }
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '11');
    expect(ticks()).toBe(0);

    // 10 s left is the first tick, then one tick each second down to 1 s.
    await advance(1000);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
    expect(ticks()).toBe(1);
    for (let i = 0; i < 9; i++) {
      await advance(1000);
    }
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(ticks()).toBe(10);

    // Time runs out: no tick for zero, and the round is sent once.
    await advance(1000);
    expect(ticks()).toBe(10);
    expect(mockAct).toHaveBeenCalledTimes(1);
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

describe('TechTrivia with a check per pick', () => {
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

  it('shows the pick at once, locks the options and sends the check with its index and option', async () => {
    mockCheck.mockReturnValueOnce(new Promise(() => {}));
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    await tap(option(GDSC));

    expect(option(GDSC)).toHaveClass('anim-pop');
    expect(option('Global Data Science Center')).toBeDisabled();
    expect(mockCheck).toHaveBeenCalledWith({ check: { index: 0, answer: GDSC } });
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('turns a right pick green and moves on 450ms after the verdict', async () => {
    mockCheck.mockResolvedValueOnce({ index: 0, correct: true, correctAnswer: GDSC });
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    await tapAndSettle(GDSC);

    expect(option(GDSC)).toHaveClass('border-[#34A853]', 'anim-pop', 'anim-flash-green');
    expect(screen.getByText('Correct!')).toBeInTheDocument();

    await advance(449);
    expect(screen.getByText(/^Q1$/)).toBeInTheDocument();
    await advance(1);
    expect(screen.getByText(/^Q2$/)).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('turns a wrong pick red with the shake, and highlights the right answer green', async () => {
    mockCheck.mockResolvedValueOnce({ index: 0, correct: false, correctAnswer: GDSC });
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    await tapAndSettle('Global Data Science Center');

    expect(option('Global Data Science Center')).toHaveClass('anim-shake', 'anim-flash-red', 'border-[#EA4335]');
    expect(option(GDSC)).toHaveClass('border-[#34A853]', 'bg-[#E6F4EA]');
    expect(screen.getByText('Not quite')).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('gives a slow verdict up after 1200ms, moves on, and ignores the late reply', async () => {
    const late = deferred<unknown>();
    mockCheck.mockReturnValueOnce(late.promise);
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    await tap(option(GDSC));
    await advance(1199);
    expect(screen.getByText(/^Q1$/)).toBeInTheDocument();
    await advance(1);
    expect(screen.getByText(/^Q2$/)).toBeInTheDocument();

    await act(async () => {
      late.resolve({ index: 0, correct: true, correctAnswer: GDSC });
    });
    await settle();
    // The late reply is for question 1, so question 2 keeps its neutral look.
    expect(screen.getByText(/^Q2$/)).toBeInTheDocument();
    expect(option(FLUTTER).className).not.toMatch(/anim-flash|border-\[#34A853\]|border-\[#EA4335\]/);
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('a check that fails shows the neutral look, moves on after the usual flash, and the picks still go in the batch', async () => {
    mockCheck.mockRejectedValue(new Error('Server busy'));
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    await tapAndSettle(GDSC);
    expect(screen.getByText('Locked in')).toBeInTheDocument();
    expect(option(GDSC)).not.toHaveClass('anim-flash-green');
    expect(option(GDSC)).not.toHaveClass('anim-flash-red');

    await advance(200);
    expect(screen.getByText(/^Q2$/)).toBeInTheDocument();

    await pickAndAdvance(FLUTTER);
    await pickAndAdvance(GEMINI);
    expect(mockAct).toHaveBeenCalledWith({ answers: [GDSC, FLUTTER, GEMINI] });
  });

  it('when time runs out while a check is still out, the round is sent with the picks so far, once', async () => {
    const late = deferred<unknown>();
    mockCheck.mockReturnValueOnce(late.promise);
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    for (let i = 0; i < 34; i++) {
      await advance(1000);
    }
    await advance(900);
    await tap(option(GDSC));
    await advance(100);
    await advance(5000);

    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: [GDSC, null, null] });

    // The reply comes after the round has gone: it changes nothing and sends nothing.
    await act(async () => {
      late.resolve({ index: 0, correct: true, correctAnswer: GDSC });
    });
    await advance(5000);
    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Checking your answers…')).toBeInTheDocument();
  });

  it('plays the correct cue for a right pick and the wrong cue for a wrong one', async () => {
    mockCheck.mockResolvedValueOnce({ index: 0, correct: true, correctAnswer: GDSC });
    mockCheck.mockResolvedValueOnce({ index: 1, correct: false, correctAnswer: FLUTTER });
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    await tapAndSettle(GDSC);
    expect(feedback).toHaveBeenLastCalledWith('correct');
    await advance(450);
    await tapAndSettle(ANGULAR);
    expect(feedback).toHaveBeenLastCalledWith('wrong');
  });

  it('plays the streak cue and shows the pill after three right answers in a row', async () => {
    const correct = [GDSC, FLUTTER, GEMINI];
    mockCheck.mockImplementation(async ({ check: { index, answer } }: { check: { index: number; answer: string } }) => ({
      index,
      correct: answer === correct[index],
      correctAnswer: correct[index],
    }));
    mockAct.mockReturnValueOnce(new Promise(() => {}));
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={jest.fn()} />);
    startGame();

    await tapAndSettle(GDSC);
    await advance(450);
    await tapAndSettle(FLUTTER);
    await advance(450);
    await tapAndSettle(GEMINI);

    expect(feedback).toHaveBeenLastCalledWith('streak');
    expect(screen.getByText('x3 streak')).toBeInTheDocument();
  });

  it('plays a whole round with checks and sends the final batch once', async () => {
    const answers = [GDSC, FLUTTER, GEMINI];
    const correct = [GDSC, FLUTTER, GEMINI];
    mockCheck.mockImplementation(async ({ check: { index, answer } }: { check: { index: number; answer: string } }) => ({
      index,
      correct: answer === correct[index],
      correctAnswer: correct[index],
    }));
    mockAct.mockResolvedValueOnce(
      batchReply(answers.map((a) => ({ answered: true, correct: true, correctAnswer: a }))),
    );
    const onDone = jest.fn();
    render(<TechTrivia questions={questions} act={mockAct} check={mockCheck} onDone={onDone} />);
    startGame();

    for (const answer of answers) {
      await tapAndSettle(answer);
      await advance(450);
    }

    expect(mockCheck).toHaveBeenCalledTimes(3);
    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers });
    expect(screen.getByText('3 correct')).toBeInTheDocument();
    await tap(screen.getByRole('button', { name: 'Continue' }));
    expect(onDone).toHaveBeenCalledWith(result);
  });
});
