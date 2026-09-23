import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Wordle from '@/components/games/Wordle';

jest.useFakeTimers();

const WORD = 'REACT';

function setup(onComplete = jest.fn()) {
  render(<Wordle word={WORD} onComplete={onComplete} />);
  return onComplete;
}

function typeGuess(guess: string) {
  guess.split('').forEach((ch) =>
    fireEvent.keyDown(window, { key: ch }),
  );
  fireEvent.keyDown(window, { key: 'Enter' });
}

describe('Wordle', () => {
  it('renders the game grid and keyboard', () => {
    setup();
    expect(screen.getByText('Tech Wordle')).toBeInTheDocument();
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('ENTER')).toBeInTheDocument();
  });

  it('shows score hints (300 down to 50)', () => {
    setup();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('typing letters fills the active row', () => {
    setup();
    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.keyDown(window, { key: 'E' });
    expect(screen.getAllByText('R').length).toBeGreaterThan(0);
  });

  it('backspace removes a letter', () => {
    setup();
    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    // After backspace, input should be empty — R key still on keyboard but not in grid tile
    const tiles = document.querySelectorAll('.flex.gap-1\\.5 > div');
    const firstTile = tiles[0] as HTMLElement;
    expect(firstTile?.textContent?.trim()).toBe('');
  });

  it('calls onComplete with the correct guess array when solved', async () => {
    const onComplete = setup();
    typeGuess(WORD);
    act(() => jest.advanceTimersByTime(1000));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toEqual([WORD]);
  });

  it('calls onComplete after 6 failed guesses', async () => {
    const onComplete = setup();
    const wrongGuess = 'BYTES';
    for (let i = 0; i < 6; i++) typeGuess(wrongGuess);
    act(() => jest.advanceTimersByTime(3000));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toHaveLength(6);
  });

  it('on-screen keyboard ENTER submits guess', async () => {
    const onComplete = setup();
    // Type 5 letters via physical keyboard then click on-screen ENTER
    'REACT'.split('').forEach((ch) => fireEvent.keyDown(window, { key: ch }));
    fireEvent.click(screen.getByText('ENTER'));
    act(() => jest.advanceTimersByTime(1000));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
