import { render } from '@testing-library/react';
import Burst from '@/components/Burst';

describe('Burst', () => {
  it('renders 12 pieces by default', () => {
    const { container } = render(<Burst />);
    expect(container.querySelectorAll('.burst-piece')).toHaveLength(12);
  });

  it('renders the number of pieces asked for', () => {
    const { container } = render(<Burst count={5} />);
    expect(container.querySelectorAll('.burst-piece')).toHaveLength(5);
  });

  it('hides the burst from assistive tech and keeps the extra class', () => {
    const { container } = render(<Burst className="top-2" />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveClass('burst', 'top-2');
  });

  it('takes each piece colour from the colors prop, in order', () => {
    const colors = ['#111111', '#222222'];
    const { container } = render(<Burst count={4} colors={colors} />);
    const pieces = Array.from(container.querySelectorAll<HTMLElement>('.burst-piece'));
    expect(pieces.map((p) => p.style.getPropertyValue('--burst-color'))).toEqual([
      '#111111',
      '#222222',
      '#111111',
      '#222222',
    ]);
  });

  it('falls back to the default colours when the colors prop is empty', () => {
    const { container } = render(<Burst count={1} colors={[]} />);
    const piece = container.querySelector<HTMLElement>('.burst-piece');
    expect(piece?.style.getPropertyValue('--burst-color')).toBe('#1A73E8');
  });

  it('renders identical markup on every render', () => {
    const first = render(<Burst />);
    const markup = first.container.innerHTML;
    first.unmount();

    const second = render(<Burst />);
    expect(second.container.innerHTML).toBe(markup);
  });
});
