import { render, screen, fireEvent, act } from '@testing-library/react';
import BugHunter from '@/components/games/BugHunter';
import type { BatchResponse, BugView, ReviewItem, RunResult } from '@/lib/apiTypes';

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
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const batch = (results: ReviewItem[]): BatchResponse => ({ results, done: true, result });

// Answers are 0-based line indexes, in snippet order.
const ANSWERS = [2, 1, 1];

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

// Line numbers are 1-based here to match what the player sees.
const line = (n: number) => screen.getByRole('button', { name: new RegExp(`^Line ${n}:`) });

// Picks a 1-based line and waits out the neutral transition.
async function pickAndAdvance(n: number) {
  await tap(line(n));
  await advance(250);
}

async function playAllSnippets() {
  await pickAndAdvance(3);
  await pickAndAdvance(2);
  await pickAndAdvance(2);
}

describe('BugHunter', () => {
  it('renders the first snippet without revealing anything and never calls act', () => {
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bug Hunter' })).toBeInTheDocument();
    expect(screen.getByText('Off-by-one loop')).toBeInTheDocument();
    expect(screen.getByText('Snippet 1 of 3')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Line \d+:/ })).toHaveLength(7);
    expect(document.body.textContent).not.toMatch(/🐞|✓|✗|correct|\bpts\b|Not quite|Nice catch|\/\s*\d/i);
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('advances to the next snippet after a short transition without calling act', async () => {
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(line(3));

    expect(mockAct).not.toHaveBeenCalled();
    expect(screen.getByText('Snippet 1 of 3')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/🐞|✓|✗|correct|\bpts\b/i);

    await advance(249);
    expect(screen.getByText('Snippet 1 of 3')).toBeInTheDocument();

    await advance(1);
    expect(screen.getByText('Snippet 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Shared default argument')).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('locks the snippet during the transition so a second tap cannot skip a snippet', async () => {
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    await tap(line(3));
    expect(screen.getByRole('button', { name: /^Line 3:.*, selected$/ })).toBeInTheDocument();
    expect(line(1)).toBeDisabled();
    await tap(line(1));
    await advance(250);

    expect(screen.getByText('Snippet 2 of 3')).toBeInTheDocument();
    expect(mockAct).not.toHaveBeenCalled();
  });

  it('sends every answer once, in snippet order, after the last pick and shows a checking state', async () => {
    const pending = deferred<BatchResponse>();
    mockAct.mockReturnValueOnce(pending.promise);
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    await playAllSnippets();

    expect(mockAct).toHaveBeenCalledTimes(1);
    expect(mockAct).toHaveBeenCalledWith({ answers: ANSWERS });
    expect(screen.getByText('Checking your answers…')).toBeInTheDocument();

    await advance(5000);
    expect(mockAct).toHaveBeenCalledTimes(1);
  });

  it('shows a review with mixed correct and incorrect answers, the bug line and explanations', async () => {
    mockAct.mockResolvedValueOnce(
      batch([
        { answered: true, correct: true, correctAnswer: 2, explanation: EXPLANATION_1 },
        { answered: true, correct: false, correctAnswer: 0, explanation: EXPLANATION_2 },
        { answered: true, correct: true, correctAnswer: 1, explanation: EXPLANATION_3 },
      ]),
    );
    const onDone = jest.fn();
    render(<BugHunter questions={questions} act={mockAct} onDone={onDone} />);

    await playAllSnippets();

    expect(screen.getByRole('heading', { name: 'Your answers' })).toBeInTheDocument();
    expect(screen.getAllByText('Correct')).toHaveLength(2);
    expect(screen.getAllByText('Incorrect')).toHaveLength(1);
    expect(screen.getAllByText(/🐞 Bug/)).toHaveLength(3);
    expect(screen.getByText(/✗ Your pick/)).toBeInTheDocument();
    expect(screen.getByText(/Your pick: line 2\. The bug is on line 1\./)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION_1)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION_2)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION_3)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Line \d+:/ })).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the error inline and re-sends identical answers on Try again without losing them', async () => {
    mockAct
      .mockRejectedValueOnce(new Error('Server busy'))
      .mockResolvedValueOnce(batch(ANSWERS.map((a) => ({ answered: true, correct: true, correctAnswer: a }))));
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);

    await playAllSnippets();

    expect(screen.getByRole('alert')).toHaveTextContent('Server busy');
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
    render(<BugHunter questions={questions} act={mockAct} onDone={onDone} />);

    await playAllSnippets();
    const cont = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(cont);
    fireEvent.click(cont);
    await advance(5000);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(result);
    expect(mockAct).toHaveBeenCalledTimes(1);
  });

  it('never shows correctness, points or a maximum before submission', async () => {
    render(<BugHunter questions={questions} act={mockAct} onDone={jest.fn()} />);
    const hidden = /🐞|✓|✗|correct|incorrect|wrong|not quite|nice catch|\bpts\b|\/\s*\d/i;

    // Two of three snippets: the third pick would submit.
    for (const n of [3, 2]) {
      await tap(line(n));
      expect(document.body.textContent).not.toMatch(hidden);
      await advance(250);
      expect(document.body.textContent).not.toMatch(hidden);
    }
    expect(mockAct).not.toHaveBeenCalled();
  });
});
