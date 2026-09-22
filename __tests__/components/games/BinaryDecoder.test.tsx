import { render, screen, fireEvent } from '@testing-library/react';
import BinaryDecoder from '@/components/games/BinaryDecoder';

describe('BinaryDecoder', () => {
  it('shows binary for the player name', () => {
    render(<BinaryDecoder playerName="Ahmad" onComplete={jest.fn()} />);
    // 'A' = 65 = 01000001
    expect(screen.getByText(/01000001/)).toBeInTheDocument();
  });

  it('calls onComplete(100) for correct binary guess', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. 01000001/i), { target: { value: '01000001' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('calls onComplete(0) for wrong binary guess', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. 01000001/i), { target: { value: '11111111' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(onComplete).toHaveBeenCalledWith(0);
  });

  it('does not call onComplete twice on double click', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. 01000001/i), { target: { value: '01000001' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
