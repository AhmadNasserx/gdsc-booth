import { render, screen, fireEvent, act } from '@testing-library/react';
import BinaryDecoder from '@/components/games/BinaryDecoder';

jest.useFakeTimers();

describe('BinaryDecoder', () => {
  afterEach(() => jest.clearAllTimers());

  it('shows binary for the player name', () => {
    // playerName "X" = 01011000; binaryChar "42" — no overlap
    render(<BinaryDecoder playerName="X" binaryChar="42" onComplete={jest.fn()} />);
    expect(screen.getByText(/01011000/)).toBeInTheDocument();
  });

  it('shows the server-assigned number as one of the 4 choices', () => {
    render(<BinaryDecoder playerName="Ahmad" binaryChar="42" onComplete={jest.fn()} />);
    const buttons = screen.getAllByRole('button').filter((b) => /^\d+$/.test(b.textContent ?? ''));
    expect(buttons).toHaveLength(4);
    expect(buttons.some((b) => b.textContent === '42')).toBe(true);
  });

  it('calls onComplete with the chosen number', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" binaryChar="42" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: '42' }));
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledWith('42');
  });

  it('calls onComplete with wrong number when wrong is chosen', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" binaryChar="42" onComplete={onComplete} />);
    const wrongButton = screen.getAllByRole('button')
      .find((b) => /^\d+$/.test(b.textContent ?? '') && b.textContent !== '42')!;
    fireEvent.click(wrongButton);
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledWith(wrongButton.textContent);
  });

  it('does not call onComplete twice on double click', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" binaryChar="42" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: '42' }));
    fireEvent.click(screen.getByRole('button', { name: '42' }));
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
