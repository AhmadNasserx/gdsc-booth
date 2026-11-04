import { render } from '@testing-library/react';
import EmojiWarm from '@/components/EmojiWarm';

describe('EmojiWarm', () => {
  it('is hidden from assistive tech and uses the emoji font stack', () => {
    const { container } = render(<EmojiWarm glyphs={['🍎']} />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root).toHaveClass('font-emoji');
  });

  it('draws each glyph once, in order, as its own span', () => {
    const { container } = render(<EmojiWarm glyphs={['🍎', '🍌', '🍇']} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.children).toHaveLength(3);
    expect(Array.from(root.children).map((child) => child.textContent)).toEqual(['🍎', '🍌', '🍇']);
    expect(root.textContent).toBe('🍎🍌🍇');
  });

  it('keeps duplicate glyphs, since the caller decides the list', () => {
    const { container } = render(<EmojiWarm glyphs={['🍎', '🍎']} />);
    expect(container.firstElementChild?.children).toHaveLength(2);
  });
});
