import { render, screen, fireEvent, act } from '@testing-library/react';
import BugHunter from '@/components/games/BugHunter';
import type { AnswerResponse, BugView, RunResult } from '@/lib/apiTypes';

const questions: BugView[] = [
  {
    title: 'Off-by-one loop',
    language: 'JavaScript',
    lines: [
      'function sum(xs) {',
      '  let total = 0;',
      '  for (let i = 0; i <= xs.length; i++) {',
      '    total += xs[i];',
      '  }',
      '  return total;',
      '}',
    ],
  },
  {
    title: 'Shared default argument',
    language: 'Python',
    lines: [
      'def add(item, bucket=[]):',
      '    bucket.append(item)',
      '    return bucket',
    ],
  },
  {
    title: 'Assignment in condition',
    language: 'JavaScript',
    lines: [
      'function same(a, b) {',
      '  if (a = b) {',
      '    return true;',
      '  }',
      '  return false;',
      '}',
    ],
  },
];

const EXPLANATION_1 = 'The loop runs one step past the end, so xs[i] is undefined on the last pass.';
const EXPLANATION_2 = 'Default lists are created once and reused by every call.';
const EXPLANATION_3 = 'A single = assigns instead of comparing.';

const result: RunResult = {
  game: 'bugs',
  score: 120,
  best: 120,
  improved: true,
  total: 120,
  rank: 1,
  gamesPlayed: ['bugs'],
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

const reply = (correct: boolean, correctAnswer: number, explanation: string, done = false, extra: Partial<AnswerResponse> = {}): AnswerResponse => ({
  correct,
  correctAnswer,
  explanation,
  done,
  ...extra,
});

async function tap(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

// Line numbers are 1-based here to match what the player sees.
const line = (n: number) => screen.getByRole('button', { name: new RegExp(`^Line ${n}:`) });
const nextOrFinish = () => screen.getByRole('button', { name: /^(Next →|Finish)$/ });

describe('BugHunter', () => {
  it('renders the first snippet with title, language, progress and a zero score, without revealing the bug', () => {
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bug Hunter' })).toBeInTheDocument();
    expect(screen.getByText('Off-by-one loop')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Snippet 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Line \d+:/ })).toHaveLength(7);
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('sends the 0-based line index and reveals a correct pick with +40, the explanation and a Next button', async () => {
    mockAct.mockResolvedValueOnce(reply(true, 2, EXPLANATION_1));
    const onDone = jest.fn();
    render(<BugHunter questions={questions} act={mockAct} onDone={onDone} />);

    await tap(line(3));

    expect(mockAct).toHaveBeenCalledWith({ answer: 2, q: 0 });
    expect(screen.getByRole('button', { name: /your answer, correct$/ })).toBeInTheDocument();
    expect(screen.getByText('+40')).toBeInTheDocument();
    expect(screen.getByText('40 pts')).toBeInTheDocument();
    expect(screen.getByText(/Nice catch/)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION_1)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next →' })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('reveals a wrong pick with the server-named bug line and adds no points', async () => {
    mockAct.mockResolvedValueOnce(reply(false, 2, EXPLANATION_1));
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(line(1));

    expect(screen.getByRole('button', { name: /your answer, wrong$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /the bug$/ })).toBeInTheDocument();
    expect(screen.getByText('✗ Your pick')).toBeInTheDocument();
    expect(screen.getByText('🐞 Bug')).toBeInTheDocument();
    expect(screen.getByText(/Not quite\. The bug is on line 3\./)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION_1)).toBeInTheDocument();
    expect(screen.queryByText('+40')).not.toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('disables every line while a request is pending and ignores repeat taps', async () => {
    const pending = deferred<AnswerResponse>();
    mockAct.mockReturnValueOnce(pending.promise);
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    fireEvent.click(line(3));
    expect(line(1)).toBeDisabled();
    fireEvent.click(line(3));
    expect(mockAct).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(reply(true, 2, EXPLANATION_1));
    });
    expect(line(3)).toBeDisabled();
    expect(screen.getByText('40 pts')).toBeInTheDocument();
  });

  it('shows an inline error without revealing, and Try again re-sends the same line', async () => {
    mockAct
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(reply(true, 2, EXPLANATION_1));
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(line(3));

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Snippet 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Try again' }));

    expect(mockAct).toHaveBeenCalledTimes(2);
    expect(mockAct).toHaveBeenLastCalledWith({ answer: 2, q: 0 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('40 pts')).toBeInTheDocument();
  });

  it('advances with Next, labels the last step Finish and calls onDone once with the last answer result', async () => {
    mockAct
      .mockResolvedValueOnce(reply(true, 2, EXPLANATION_1))
      .mockResolvedValueOnce(reply(false, 0, EXPLANATION_2))
      .mockResolvedValueOnce(reply(true, 1, EXPLANATION_3, true, { result }));
    const onDone = jest.fn();
    render(<BugHunter questions={questions} act={mockAct} onDone={onDone} />);

    // Q1: correct
    await tap(line(3));
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByText('Shared default argument')).toBeInTheDocument();
    expect(screen.getByText('Snippet 2 of 3')).toBeInTheDocument();
    expect(screen.queryByText(EXPLANATION_1)).not.toBeInTheDocument();

    // Q2: wrong (picked line 2, bug is line 1)
    await tap(line(2));
    expect(screen.getByText(/Not quite\. The bug is on line 1\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));

    // Q3: correct on the last snippet; the step is labelled Finish
    expect(screen.getByText('Assignment in condition')).toBeInTheDocument();
    await tap(line(2));
    expect(screen.getByText('80 pts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
    expect(mockAct.mock.calls).toEqual([
      [{ answer: 2, q: 0 }],
      [{ answer: 1, q: 1 }],
      [{ answer: 1, q: 2 }],
    ]);
  });

  it('shows Finish straight away for a single snippet and reports the result once', async () => {
    mockAct.mockResolvedValueOnce(reply(true, 3, EXPLANATION_3, true, { result }));
    const onDone = jest.fn();
    render(<BugHunter questions={[questions[2]]} act={mockAct} onDone={onDone} />);

    await tap(line(4));
    expect(nextOrFinish()).toHaveTextContent('Finish');
    fireEvent.click(nextOrFinish());
    fireEvent.click(nextOrFinish());

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
    expect(mockAct).toHaveBeenCalledTimes(1);
  });

  it('re-sends the same question index after a failed pick on a later snippet', async () => {
    mockAct
      .mockResolvedValueOnce(reply(true, 2, EXPLANATION_1))
      .mockRejectedValueOnce(new Error('Server busy'))
      .mockResolvedValueOnce(reply(false, 0, EXPLANATION_2));
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(line(3));
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await tap(line(2));
    expect(screen.getByRole('alert')).toHaveTextContent('Server busy');
    expect(screen.getByText('Snippet 2 of 3')).toBeInTheDocument();

    await tap(screen.getByRole('button', { name: 'Try again' }));
    expect(mockAct.mock.calls).toEqual([
      [{ answer: 2, q: 0 }],
      [{ answer: 1, q: 1 }],
      [{ answer: 1, q: 1 }],
    ]);
    expect(screen.getByText(/Not quite\. The bug is on line 1\./)).toBeInTheDocument();
  });
});
