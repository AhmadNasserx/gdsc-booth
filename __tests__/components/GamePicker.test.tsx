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
    expect(screen.getByRole('button', { name: /tech trivia/i })).toHaveTextContent(
      'Right answers add, wrong ones cost you',
    );
    expect(screen.getByRole('button', { name: /emoji riddles/i })).toHaveTextContent('Every correct answer scores');
    expect(screen.getByRole('button', { name: /bug hunter/i })).toHaveTextContent('Every bug you catch scores');
  });

  it('never shows a maximum, a "/ 1000" or an "out of" in the rendered output', () => {
    const { container } = render(<GamePicker name="Ahmad" onPick={jest.fn()} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('1000');
    expect(text).not.toContain('/ 1000');
    expect(text).not.toMatch(/max/i);
    expect(text).not.toMatch(/out of/i);
  });
});
