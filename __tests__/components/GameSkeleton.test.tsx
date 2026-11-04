import { render, screen } from '@testing-library/react';
import GameSkeleton from '@/components/GameSkeleton';
import type { Tab } from '@/lib/types';

describe('GameSkeleton', () => {
  const cases: [Tab | null, string][] = [
    ['riddles', 'Loading riddles'],
    ['trivia', 'Loading trivia'],
    ['memory', 'Loading memory match'],
    [null, 'Loading game'],
  ];

  it.each(cases)('announces the status for %s', (game, label) => {
    render(<GameSkeleton game={game} label={label} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('keeps the placeholder hidden while the status line stays readable', () => {
    const { container } = render(<GameSkeleton game="memory" label="Loading memory match" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status').closest('[aria-hidden="true"]')).toBeNull();
  });

  it('draws 16 square cells for memory', () => {
    const { container } = render(<GameSkeleton game="memory" label="Loading" />);
    expect(container.querySelectorAll('.aspect-square')).toHaveLength(16);
  });

  it('draws four option blocks for riddles', () => {
    const { container } = render(<GameSkeleton game="riddles" label="Loading" />);
    expect(container.querySelectorAll('.h-14')).toHaveLength(4);
  });

  it('draws four option blocks for trivia', () => {
    const { container } = render(<GameSkeleton game="trivia" label="Loading" />);
    expect(container.querySelectorAll('.h-14')).toHaveLength(4);
  });

  it('draws a single block when the game is not known', () => {
    const { container } = render(<GameSkeleton game={null} label="Loading" />);
    expect(container.querySelectorAll('.skeleton')).toHaveLength(1);
    expect(container.querySelectorAll('.h-40')).toHaveLength(1);
  });
});
