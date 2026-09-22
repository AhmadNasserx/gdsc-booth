import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';

jest.useFakeTimers();

describe('TechTrivia', () => {
  it('renders start screen with Start button', () => {
    render(<TechTrivia onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start speed trivia/i })).toBeInTheDocument();
  });

  it('shows first question after clicking Start', () => {
    render(<TechTrivia onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start speed trivia/i }));
    expect(screen.getByText(/Question 1\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/10s/i)).toBeInTheDocument();
  });

  it('timer expiry counts as wrong answer', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start speed trivia/i }));
    // Tick 1s at a time so React re-renders between ticks (3 questions × 10s = 30 ticks)
    for (let i = 0; i < 31; i++) {
      act(() => jest.advanceTimersByTime(1000));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(0));
  });

  it('correct answer at 10s remaining gives 25 + 8 = 33 pts', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start speed trivia/i }));
    // Answer immediately (timer just started, 10s remaining)
    fireEvent.click(screen.getByText('Google Developer Student Clubs'));
    fireEvent.click(screen.getByText('Flutter'));
    fireEvent.click(screen.getByText('Gemini'));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toBe(99); // 3 * 33
  });
});
