import { render, screen, fireEvent, act } from '@testing-library/react';
import BinaryDecoder from '@/components/games/BinaryDecoder';

jest.useFakeTimers();

describe('BinaryDecoder', () => {
  afterEach(() => jest.clearAllTimers());

  it('shows binary for the player name', () => {
    // playerName "X" = 01011000; binaryChar "A" = 01000001 — no overlap
    render(<BinaryDecoder playerName="X" binaryChar="A" onComplete={jest.fn()} />);
    expect(screen.getByText(/01011000/)).toBeInTheDocument();
  });

  it('shows the server-assigned binary char as one of the 4 choices', () => {
    render(<BinaryDecoder playerName="Ahmad" binaryChar="M" onComplete={jest.fn()} />);
    const buttons = screen.getAllByRole('button').filter((b) => /^[A-Z]$/.test(b.textContent ?? ''));
    expect(buttons).toHaveLength(4);
    expect(buttons.some((b) => b.textContent === 'M')).toBe(true);
  });

  it('calls onComplete with the chosen letter', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" binaryChar="A" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledWith('A');
  });

  it('calls onComplete with wrong letter when wrong is chosen', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" binaryChar="A" onComplete={onComplete} />);
    const wrongButton = screen.getAllByRole('button')
      .find((b) => /^[A-Z]$/.test(b.textContent ?? '') && b.textContent !== 'A')!;
    fireEvent.click(wrongButton);
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledWith(wrongButton.textContent);
  });

  it('does not call onComplete twice on double click', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" binaryChar="A" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    fireEvent.click(screen.getByRole('button', { name: 'A' }));
    act(() => jest.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
