import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';

jest.mock('@/lib/questions', () => {
  const pool = [
    { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs', 'Global Data Science Center', 'General Developer Software Council', 'Google Design & Code'], answer: 'Google Developer Student Clubs' },
    { question: 'Which Google framework builds cross-platform mobile apps?', options: ['Flutter', 'React Native', 'Angular', 'Kotlin Multiplatform'], answer: 'Flutter' },
    { question: "What is Google's flagship AI model family?", options: ['Gemini', 'Llama', 'Claude', 'GPT-4'], answer: 'Gemini' },
  ];
  return { TRIVIA_POOL: pool, pickRandom: (arr: unknown[], n: number) => arr.slice(0, n) };
});

jest.useFakeTimers();

describe('TechTrivia', () => {
  it('renders start screen with Start button', () => {
    render(<TechTrivia onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start!/i })).toBeInTheDocument();
  });

  it('shows first question after clicking Start', () => {
    render(<TechTrivia onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));
    expect(screen.getByText(/Question 1\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/10s/i)).toBeInTheDocument();
  });

  it('timer expiry counts as wrong answer (score 0)', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));
    // 3 questions × 10s + 3 × 1s for 900ms delays = 33 ticks; use 36 for safety
    for (let i = 0; i < 36; i++) {
      act(() => jest.advanceTimersByTime(1000));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(0));
  });

  it('correct instant answers score 99 pts (3 × 33)', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));

    // Answer each question immediately (timer = 10 → bonus = floor(10/10 * 8) = 8, base 25 → 33)
    fireEvent.click(screen.getByText('Google Developer Student Clubs'));
    act(() => jest.advanceTimersByTime(1000)); // fire 900ms delay → Q2
    fireEvent.click(screen.getByText('Flutter'));
    act(() => jest.advanceTimersByTime(1000)); // fire 900ms delay → Q3
    fireEvent.click(screen.getByText('Gemini'));
    act(() => jest.advanceTimersByTime(1000)); // fire 900ms delay → onComplete

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toBe(99);
  });
});
