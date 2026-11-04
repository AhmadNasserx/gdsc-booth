import { act, render, screen } from '@testing-library/react';
import CountUp from '@/components/CountUp';

const originalRaf = window.requestAnimationFrame;
const originalCancel = window.cancelAnimationFrame;
const originalMatchMedia = window.matchMedia;

// Frame callbacks queued by the component. Tests run them with a timestamp they choose.
let frames: FrameRequestCallback[] = [];

function runFrame(time: number) {
  const pending = frames;
  frames = [];
  act(() => {
    pending.forEach((cb) => cb(time));
  });
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  frames = [];
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  };
  window.cancelAnimationFrame = jest.fn();
});

afterEach(() => {
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancel;
  window.matchMedia = originalMatchMedia;
});

describe('CountUp', () => {
  it('ends on exactly the value', () => {
    render(<CountUp value={42} duration={100} />);
    runFrame(1000);
    runFrame(1050);
    runFrame(1200);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(frames).toHaveLength(0);
  });

  it('is part-way through the count before the duration has passed', () => {
    const { container } = render(<CountUp value={100} duration={100} />);
    runFrame(1000);
    runFrame(1050);
    const shown = Number(container.textContent);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(100);
  });

  it('applies the format prop to the final value', () => {
    render(<CountUp value={350} duration={100} format={(n) => `${n} pts`} />);
    runFrame(1000);
    runFrame(1200);
    expect(screen.getByText('350 pts')).toBeInTheDocument();
  });

  it('shows the value at once when the visitor prefers reduced motion', () => {
    mockMatchMedia(true);
    render(<CountUp value={42} duration={100} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(frames).toHaveLength(0);
  });

  it('shows the value at once when requestAnimationFrame is missing', () => {
    window.requestAnimationFrame = undefined as unknown as typeof window.requestAnimationFrame;
    render(<CountUp value={7} duration={100} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('cancels the pending frame on unmount', () => {
    const { unmount } = render(<CountUp value={10} duration={100} />);
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });
});
