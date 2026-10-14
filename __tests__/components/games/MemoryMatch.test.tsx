import { render, screen, fireEvent, act } from '@testing-library/react';
import MemoryMatch from '@/components/games/MemoryMatch';

// Pinning Math.random near 1 makes the Fisher-Yates shuffle the identity, so the
// deck is deterministic: cards 1-2 are 🐍, 3-4 ⚛️, 5-6 🔥, 7-8 🐳, 9-10 🦀,
// 11-12 ☁️, 13-14 🤖, 15-16 🔐.
const flip = (n: number) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Card ${n},`) }));
const faceUp = (n: number, emoji: string) => screen.getByRole('button', { name: `Card ${n}, ${emoji}` });
const faceDown = (n: number) => screen.getByRole('button', { name: `Card ${n}, face down` });
const stat = (label: string) => screen.getByRole('group', { name: new RegExp(`^${label}:`) });

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0.9999);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('MemoryMatch', () => {
  it('deals 16 face-down cards and a zeroed HUD', () => {
    render(<MemoryMatch onComplete={jest.fn()} />);
    expect(screen.getAllByRole('button', { name: /face down$/ })).toHaveLength(16);
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 0');
    expect(stat('Pairs')).toHaveAttribute('aria-label', 'Pairs: 0/8');
  });

  it('reveals the emoji when a card is tapped', () => {
    render(<MemoryMatch onComplete={jest.fn()} />);
    flip(1);
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceDown(2)).toBeInTheDocument();
  });

  it('keeps a matching pair face up and counts one move', () => {
    render(<MemoryMatch onComplete={jest.fn()} />);
    flip(1);
    flip(2);
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceUp(2, '🐍')).toBeInTheDocument();
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
    expect(stat('Pairs')).toHaveAttribute('aria-label', 'Pairs: 1/8');
  });

  it('flips a mismatched pair back after 800ms and locks the board meanwhile', () => {
    render(<MemoryMatch onComplete={jest.fn()} />);
    flip(1); // 🐍
    flip(3); // ⚛️
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceUp(3, '⚛️')).toBeInTheDocument();

    // Board is locked while resolving: this tap is ignored.
    flip(5);
    expect(faceDown(5)).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(799));
    expect(faceUp(1, '🐍')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1));
    expect(faceDown(1)).toBeInTheDocument();
    expect(faceDown(3)).toBeInTheDocument();
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
    expect(stat('Pairs')).toHaveAttribute('aria-label', 'Pairs: 0/8');

    // Board unlocks again after the flip back.
    flip(5);
    expect(faceUp(5, '🔥')).toBeInTheDocument();
  });

  it('ignores taps on already-flipped and matched cards', () => {
    render(<MemoryMatch onComplete={jest.fn()} />);
    flip(1);
    flip(1);
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 0');

    flip(2); // match
    flip(1); // already matched
    flip(2);
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
    expect(faceUp(1, '🐍')).toBeInTheDocument();
  });

  it('calls onComplete exactly once with moves and seconds after the final match', () => {
    const onComplete = jest.fn();
    render(<MemoryMatch onComplete={onComplete} />);

    flip(1);
    act(() => jest.advanceTimersByTime(5000));
    flip(2);
    for (let pair = 1; pair < 8; pair++) {
      flip(pair * 2 + 1);
      flip(pair * 2 + 2);
    }

    expect(screen.getByRole('status')).toHaveTextContent(/All 8 pairs found in 8 moves/);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(900));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ moves: 8, seconds: 5 });

    // Timers stopped on finish and nothing fires again.
    act(() => jest.advanceTimersByTime(10000));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('reports at least 1 second when the board is cleared instantly', () => {
    const onComplete = jest.fn();
    render(<MemoryMatch onComplete={onComplete} />);
    for (let pair = 0; pair < 8; pair++) {
      flip(pair * 2 + 1);
      flip(pair * 2 + 2);
    }
    act(() => jest.advanceTimersByTime(900));
    expect(onComplete).toHaveBeenCalledWith({ moves: 8, seconds: 1 });
  });

  it('clears pending timers on unmount', () => {
    const { unmount } = render(<MemoryMatch onComplete={jest.fn()} />);
    flip(1);
    flip(3); // mismatch schedules a flip-back, and the clock is running
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
