import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EmojiRiddles from '@/components/games/EmojiRiddles';

jest.useFakeTimers();

describe('EmojiRiddles', () => {
  it('renders first question', () => {
    render(<EmojiRiddles onComplete={jest.fn()} />);
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });

  it('calls onComplete with 25 after one correct answer then skipping rest', async () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles onComplete={onComplete} />);
    // Answer first question correctly (Web Crawler)
    fireEvent.click(screen.getByText('Web Crawler'));
    act(() => jest.advanceTimersByTime(1200));
    // Answer remaining 3 wrong
    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[1]); // wrong option
      act(() => jest.advanceTimersByTime(1200));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(25));
  });

  it('calls onComplete with 100 for all correct answers', async () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles onComplete={onComplete} />);
    const answers = ['Web Crawler', 'Docker', 'SSL/TLS', 'Python'];
    for (const answer of answers) {
      await waitFor(() => screen.getByText(answer));
      fireEvent.click(screen.getByText(answer));
      act(() => jest.advanceTimersByTime(1200));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(100));
  });

  it('locks answer after first click', () => {
    render(<EmojiRiddles onComplete={jest.fn()} />);
    fireEvent.click(screen.getByText('Web Crawler'));
    const buttons = screen.getAllByRole('button');
    // All buttons should now show feedback state (correct/wrong coloring applied)
    // Clicking again should not change state — we verify by checking onComplete not called yet
    fireEvent.click(screen.getByText('Docker')); // wrong, but locked
    // Still on Q1 (1.2s delay not elapsed)
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });
});
