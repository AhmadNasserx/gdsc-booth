import { render, screen, fireEvent, within } from '@testing-library/react';
import GamePicker from '@/components/GamePicker';

describe('GamePicker', () => {
  it('shows the header and subtitle', () => {
    render(<GamePicker name="Ahmad" onPick={jest.fn()} />);
    expect(screen.getByRole('heading', { name: 'Pick your challenge' })).toBeInTheDocument();
    expect(screen.getByText(/Hey Ahmad/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your pick is the score that goes on the leaderboard. You can still try the other games for fun!',
      ),
    ).toBeInTheDocument();
  });

  it('renders one tappable card for each of the six games', () => {
    render(<GamePicker name="Ahmad" onPick={jest.fn()} />);
    const cards = within(screen.getByRole('list')).getAllByRole('button');
    expect(cards).toHaveLength(6);
    for (const title of [
      'Emoji Riddles', 'Tech Trivia', 'Password Challenge', 'Tech Wordle', 'Memory Match', 'Bug Hunter',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(title, 'i') })).toBeInTheDocument();
    }
    expect(screen.queryByText(/binary/i)).not.toBeInTheDocument();
  });

  it('calls onPick with the game id on a single tap', () => {
    const onPick = jest.fn();
    render(<GamePicker name="Ahmad" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /memory match/i }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('memory');
  });

  it('shows the scoring rule on each card', () => {
    render(<GamePicker name="Ahmad" onPick={jest.fn()} />);
    expect(screen.getByRole('button', { name: /tech trivia/i })).toHaveTextContent('+20 right / −10 wrong');
  });
});
