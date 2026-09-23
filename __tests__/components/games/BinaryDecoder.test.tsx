import { render, screen, fireEvent, act } from '@testing-library/react';
import BinaryDecoder from '@/components/games/BinaryDecoder';

jest.useFakeTimers();

function getExpectedChar() {
  const binaryEl = screen.getByText(/^[01]{8}$/);
  return String.fromCharCode(parseInt(binaryEl.textContent!, 2));
}

describe('BinaryDecoder', () => {
  afterEach(() => jest.clearAllTimers());

  it('shows binary for the player name', () => {
    render(<BinaryDecoder playerName="Ahmad" onComplete={jest.fn()} />);
    expect(screen.getByText(/01000001/)).toBeInTheDocument();
  });

  it('shows 4 multiple-choice letter buttons', () => {
    render(<BinaryDecoder playerName="Ahmad" onComplete={jest.fn()} />);
    const buttons = screen.getAllByRole('button').filter((b) => /^[A-Z]$/.test(b.textContent ?? ''));
    expect(buttons).toHaveLength(4);
  });

  it('calls onComplete(100) when the correct letter is clicked', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: getExpectedChar() }));
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('calls onComplete(0) when a wrong letter is clicked', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    const correctChar = getExpectedChar();
    const wrongButton = screen.getAllByRole('button')
      .find((b) => /^[A-Z]$/.test(b.textContent ?? '') && b.textContent !== correctChar)!;
    fireEvent.click(wrongButton);
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledWith(0);
  });

  it('does not call onComplete twice on double click', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    const correctChar = getExpectedChar();
    fireEvent.click(screen.getByRole('button', { name: correctChar }));
    fireEvent.click(screen.getByRole('button', { name: correctChar }));
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
