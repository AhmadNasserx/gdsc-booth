import { render, screen, fireEvent } from '@testing-library/react';
import BugHunter from '@/components/games/BugHunter';
import type { BugQuestion } from '@/lib/questions';

const questions: BugQuestion[] = [
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
    answer: 2,
    explanation: 'The loop runs one step past the end, so xs[i] is undefined on the last pass.',
  },
  {
    title: 'Shared default argument',
    language: 'Python',
    lines: [
      'def add(item, bucket=[]):',
      '    bucket.append(item)',
      '    return bucket',
    ],
    answer: 0,
    explanation: 'Default lists are created once and reused by every call.',
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
    answer: 1,
    explanation: 'A single = assigns instead of comparing.',
  },
];

// Line numbers are 1-based here to match what the player sees.
const line = (n: number) => screen.getByRole('button', { name: new RegExp(`^Line ${n}:`) });
const nextOrFinish = () => screen.getByRole('button', { name: /^(Next →|Finish)$/ });

describe('BugHunter', () => {
  it('renders the first snippet with title, language, progress and a zero score', () => {
    render(<BugHunter questions={questions} onComplete={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bug Hunter' })).toBeInTheDocument();
    expect(screen.getByText('Off-by-one loop')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Snippet 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Line \d+:/ })).toHaveLength(7);
  });

  it('reveals a correct pick with +40, the explanation and a Next button', () => {
    const onComplete = jest.fn();
    render(<BugHunter questions={questions} onComplete={onComplete} />);

    fireEvent.click(line(3));

    expect(screen.getByRole('button', { name: /your answer, correct$/ })).toBeInTheDocument();
    expect(screen.getByText('+40')).toBeInTheDocument();
    expect(screen.getByText('40 pts')).toBeInTheDocument();
    expect(screen.getByText(/Nice catch/)).toBeInTheDocument();
    expect(screen.getByText(questions[0].explanation)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next →' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reveals a wrong pick, highlights the true bug line and adds no points', () => {
    render(<BugHunter questions={questions} onComplete={jest.fn()} />);

    fireEvent.click(line(1));

    expect(screen.getByRole('button', { name: /your answer, wrong$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /the bug$/ })).toBeInTheDocument();
    expect(screen.getByText('✗ Your pick')).toBeInTheDocument();
    expect(screen.getByText('🐞 Bug')).toBeInTheDocument();
    expect(screen.getByText(/Not quite\. The bug is on line 3\./)).toBeInTheDocument();
    expect(screen.getByText(questions[0].explanation)).toBeInTheDocument();
    expect(screen.queryByText('+40')).not.toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('locks every line once a pick is revealed', () => {
    render(<BugHunter questions={questions} onComplete={jest.fn()} />);
    fireEvent.click(line(1));

    expect(line(3)).toBeDisabled();
    fireEvent.click(line(3));
    expect(screen.queryByText(/your answer, correct/)).not.toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
  });

  it('ignores a double tap on the same line', () => {
    render(<BugHunter questions={questions} onComplete={jest.fn()} />);
    fireEvent.click(line(3));
    fireEvent.click(line(3));
    expect(screen.getByText('40 pts')).toBeInTheDocument();
  });

  it('advances with Next, labels the last step Finish, and reports answers once', () => {
    const onComplete = jest.fn();
    render(<BugHunter questions={questions} onComplete={onComplete} />);

    // Q1: correct
    fireEvent.click(line(3));
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByText('Shared default argument')).toBeInTheDocument();
    expect(screen.getByText('Snippet 2 of 3')).toBeInTheDocument();
    expect(screen.queryByText(questions[0].explanation)).not.toBeInTheDocument();

    // Q2: wrong (picked line 2, bug is line 1)
    fireEvent.click(line(2));
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));

    // Q3: correct, and the last step is labelled Finish
    expect(screen.getByText('Assignment in condition')).toBeInTheDocument();
    fireEvent.click(line(2));
    expect(screen.getByText('80 pts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([2, 1, 1]);
  });

  it('shows Finish straight away for a single snippet and reports one answer', () => {
    const onComplete = jest.fn();
    render(<BugHunter questions={[questions[0]]} onComplete={onComplete} />);

    fireEvent.click(line(4));
    expect(nextOrFinish()).toHaveTextContent('Finish');
    fireEvent.click(nextOrFinish());
    fireEvent.click(nextOrFinish());

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([3]);
  });
});
