import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';

const questions = [
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs', 'Global Data Science Center', 'General Developer Software Council', 'Google Design & Code'], answer: 'Google Developer Student Clubs' },
  { question: 'Which Google framework builds cross-platform mobile apps?', options: ['Flutter', 'React Native', 'Angular', 'Kotlin Multiplatform'], answer: 'Flutter' },
  { question: "What is Google's flagship AI model family?", options: ['Gemini', 'Llama', 'Claude', 'GPT-4'], answer: 'Gemini' },
];

jest.useFakeTimers();

describe('TechTrivia', () => {
  it('renders start screen with Start button', () => {
    render(<TechTrivia questions={questions} onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start!/i })).toBeInTheDocument();
  });

  it('shows first question after clicking Start', () => {
    render(<TechTrivia questions={questions} onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));
    expect(screen.getByText(/Question 1\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/10s/i)).toBeInTheDocument();
  });

  it('timer expiry sends empty string answers', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia questions={questions} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));
    // 3 questions × 10s + 3 × 1s for 900ms delays = 33 ticks; use 36 for safety
    for (let i = 0; i < 36; i++) {
      act(() => jest.advanceTimersByTime(1000));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const answers = onComplete.mock.calls[0][0];
    expect(answers).toHaveLength(3);
    answers.forEach((a: { answer: string; remaining: number }) => {
      expect(a.answer).toBe('');
      expect(a.remaining).toBe(0);
    });
  });

  it('correct instant answers produce remaining=10 in each answer', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia questions={questions} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));

    fireEvent.click(screen.getByText('Google Developer Student Clubs'));
    act(() => jest.advanceTimersByTime(1000));
    fireEvent.click(screen.getByText('Flutter'));
    act(() => jest.advanceTimersByTime(1000));
    fireEvent.click(screen.getByText('Gemini'));
    act(() => jest.advanceTimersByTime(1000));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const answers = onComplete.mock.calls[0][0];
    expect(answers).toHaveLength(3);
    expect(answers[0]).toEqual({ answer: 'Google Developer Student Clubs', remaining: 10 });
    expect(answers[1]).toEqual({ answer: 'Flutter', remaining: 10 });
    expect(answers[2]).toEqual({ answer: 'Gemini', remaining: 10 });
  });
});
