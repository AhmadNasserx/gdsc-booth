import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';

const questions = [
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs', 'Global Data Science Center', 'General Developer Software Council', 'Google Design & Code'], answer: 'Google Developer Student Clubs' },
  { question: 'Which Google framework builds cross-platform mobile apps?', options: ['Flutter', 'React Native', 'Angular', 'Kotlin Multiplatform'], answer: 'Flutter' },
  { question: "What is Google's flagship AI model family?", options: ['Gemini', 'Llama', 'Claude', 'GPT-4'], answer: 'Gemini' },
];

jest.useFakeTimers();

describe('TechTrivia', () => {
  it('renders start screen with Start button and 35s description', () => {
    render(<TechTrivia questions={questions} onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start!/i })).toBeInTheDocument();
    expect(screen.getByText(/35 seconds/i)).toBeInTheDocument();
  });

  it('shows first question after clicking Start', () => {
    render(<TechTrivia questions={questions} onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));
    expect(screen.getByText(/Q1/i)).toBeInTheDocument();
    expect(screen.getByText(/35s/i)).toBeInTheDocument();
  });

  it('timer expiry calls onComplete with answered questions', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia questions={questions} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));
    // Advance 35 ticks to expire the 35-second global timer
    for (let i = 0; i < 36; i++) {
      act(() => jest.advanceTimersByTime(1000));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const answers = onComplete.mock.calls[0][0];
    expect(Array.isArray(answers)).toBe(true);
    // No answers were submitted (timer ran out before any click)
    expect(answers).toHaveLength(0);
  });

  it('correct answer adds 20 points and advances question', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia questions={questions} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));

    fireEvent.click(screen.getByText('Google Developer Student Clubs'));
    // Should show 20 pts
    await waitFor(() => expect(screen.getByText(/20 pts/i)).toBeInTheDocument());
    // Advance past correct-answer delay (600ms)
    act(() => jest.advanceTimersByTime(700));
    // Q2 should now be visible
    await waitFor(() => expect(screen.getByText(/Flutter/i)).toBeInTheDocument());
  });

  it('wrong answer deducts points and shows lockout banner', async () => {
    render(<TechTrivia questions={questions} onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));

    // Click a wrong answer
    fireEvent.click(screen.getByText('Global Data Science Center'));
    await waitFor(() => expect(screen.getByText(/Wrong!/i)).toBeInTheDocument());
    // Score should stay at 0 (can't go below 0); score span contains "0 pts" inside Q1 header
    expect(screen.getAllByText(/0 pts/i).length).toBeGreaterThan(0);
  });

  it('correct answers produce answers with correct answer field', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia questions={questions} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start!/i }));

    fireEvent.click(screen.getByText('Google Developer Student Clubs'));
    act(() => jest.advanceTimersByTime(700));
    await waitFor(() => screen.getByText('Flutter'));
    fireEvent.click(screen.getByText('Flutter'));
    act(() => jest.advanceTimersByTime(700));

    // Let timer expire to trigger onComplete
    for (let i = 0; i < 40; i++) {
      act(() => jest.advanceTimersByTime(1000));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const answers = onComplete.mock.calls[0][0];
    expect(answers[0]).toEqual({ answer: 'Google Developer Student Clubs' });
    expect(answers[1]).toEqual({ answer: 'Flutter' });
  });
});
