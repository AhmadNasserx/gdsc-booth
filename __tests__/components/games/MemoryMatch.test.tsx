import { render, screen, fireEvent, act } from '@testing-library/react';
import MemoryMatch from '@/components/games/MemoryMatch';
import type { FlipResponse, RunResult } from '@/lib/apiTypes';
import { MEMORY_EMOJIS } from '@/lib/memoryEmojis';

// The layout lives on the server. The fake server below uses this one so the
// expectations are readable: cards 1-2 🐍, 3-4 ⚛️, 5-6 🔥, 7-8 🐳, 9-10 🦀,
// 11-12 ☁️, 13-14 🤖, 15-16 🔐 (1-based in the UI).
const LAYOUT = ['🐍', '🐍', '⚛️', '⚛️', '🔥', '🔥', '🐳', '🐳', '🦀', '🦀', '☁️', '☁️', '🤖', '🤖', '🔐', '🔐'];

const RESULT: RunResult = {
  game: 'memory',
  score: 812,
  best: 812,
  improved: true,
  total: 812,
  rank: 3,
  gamesPlayed: ['memory'],
};

/**
 * Minimal server stand-in that follows the contract's rules: the first flip of an
 * attempt reports 'none', the second reports 'match' or 'mismatch' with `other`.
 */
function makeServer(layout: string[] = LAYOUT) {
  const matched = new Set<number>();
  let open: number | null = null;
  let moves = 0;

  return async ({ flip }: { flip: number }): Promise<FlipResponse> => {
    const emoji = layout[flip];
    if (open === null) {
      open = flip;
      return { index: flip, emoji, moves, pair: 'none', done: false };
    }

    const first = open;
    open = null;
    moves += 1;
    if (layout[first] === emoji) {
      matched.add(first);
      matched.add(flip);
      const done = matched.size === layout.length;
      return {
        index: flip,
        emoji,
        moves,
        pair: 'match',
        other: first,
        done,
        ...(done ? { result: RESULT } : {}),
      };
    }
    return { index: flip, emoji, moves, pair: 'mismatch', other: first, done: false };
  };
}

type Act = jest.Mock<Promise<FlipResponse>, [{ flip: number }]>;

/** A flip request that stays in flight until the test finishes it, to check the board mid-flight. */
function holdFlip(server: (body: { flip: number }) => Promise<FlipResponse>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    request: async (body: { flip: number }) => {
      await gate;
      return server(body);
    },
    finish: async () => {
      await act(async () => release());
    },
  };
}

function setup(flipAct: Act = jest.fn(makeServer()), onDone = jest.fn()) {
  const utils = render(<MemoryMatch cards={16} act={flipAct} onDone={onDone} />);
  return { ...utils, act: flipAct, onDone };
}

/** The card board, without the hidden warm-up row. */
const board = () => screen.getByRole('group', { name: 'Memory cards' });

/** Longest wait a mismatched pair stays face up. */
const MISMATCH_WAIT_MS = 600;

/** Taps card N (1-based) and waits for the request to settle. */
async function tap(n: number) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Card ${n},`) }));
  });
}

const faceUp = (n: number, emoji: string) => screen.getByRole('button', { name: `Card ${n}, ${emoji}` });
const faceDown = (n: number) => screen.getByRole('button', { name: `Card ${n}, face down` });
const stat = (label: string) => screen.getByRole('group', { name: new RegExp(`^${label}:`) });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MemoryMatch', () => {
  it('renders 16 face-down cards in a 4-column grid with a zeroed HUD and reveals nothing up front', () => {
    const { act: flipAct } = setup();
    expect(screen.getAllByRole('button', { name: /face down$/ })).toHaveLength(16);
    expect(board()).toHaveClass('grid-cols-4');
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 0');
    expect(stat('Pairs')).toHaveAttribute('aria-label', 'Pairs: 0');
    expect(flipAct).not.toHaveBeenCalled();
  });

  it('keeps the layout out of the markup until a card is flipped', async () => {
    setup();
    // Every card face is empty: no emoji is drawn on the board before a flip.
    expect(board().textContent).toBe('?'.repeat(16));

    await tap(1);
    // Only the flipped card shows its face.
    expect(board().textContent).toBe('?🐍' + '?'.repeat(15));
    for (const emoji of new Set(LAYOUT)) {
      if (emoji !== '🐍') expect(board().textContent).not.toContain(emoji);
    }
  });

  it('draws all eight faces once in a hidden warm-up row outside the board', () => {
    const { container } = setup();
    expect(MEMORY_EMOJIS).toHaveLength(8);

    const warmUp = Array.from(container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).find(
      (el) => el.textContent === MEMORY_EMOJIS.join(''),
    );
    expect(warmUp).toBeInTheDocument();
    expect(warmUp).toHaveClass('absolute', 'opacity-0', 'pointer-events-none');
    expect(board()).not.toContainElement(warmUp as HTMLElement);
  });

  it('tapping a card calls act with its index and reveals the emoji from the response', async () => {
    const flipAct: Act = jest.fn<Promise<FlipResponse>, [{ flip: number }]>(async () => ({
      index: 0,
      emoji: '🐍',
      moves: 0,
      pair: 'none',
      done: false,
    }));
    setup(flipAct);
    await tap(1);
    expect(flipAct).toHaveBeenCalledWith({ flip: 0 });
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceDown(2)).toBeInTheDocument();
  });

  it('keeps a matching pair face up and counts one move', async () => {
    setup();
    await tap(1);
    await tap(2);
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceUp(2, '🐍')).toBeInTheDocument();
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
    expect(stat('Pairs')).toHaveAttribute('aria-label', 'Pairs: 1');
  });

  it('flips a mismatched pair back after 600ms and locks the board meanwhile', async () => {
    const { act: flipAct } = setup();
    await tap(1); // 🐍
    await tap(3); // ⚛️ mismatch
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceUp(3, '⚛️')).toBeInTheDocument();
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');

    // Board is locked while the mismatch is showing: this tap never reaches the server.
    await tap(5);
    expect(flipAct).toHaveBeenCalledTimes(2);
    expect(faceDown(5)).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(MISMATCH_WAIT_MS - 1));
    expect(faceUp(1, '🐍')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1));
    expect(faceDown(1)).toBeInTheDocument();
    expect(faceDown(3)).toBeInTheDocument();
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
    expect(stat('Pairs')).toHaveAttribute('aria-label', 'Pairs: 0');

    // The board unlocks after the flip back.
    await tap(5);
    expect(flipAct).toHaveBeenCalledTimes(3);
    expect(faceUp(5, '🔥')).toBeInTheDocument();
  });

  it('ignores taps on revealed and matched cards without calling act', async () => {
    const { act: flipAct } = setup();
    await tap(1);
    await tap(1); // already face up
    expect(flipAct).toHaveBeenCalledTimes(1);

    await tap(2); // match
    await tap(1); // matched
    await tap(2); // matched
    expect(flipAct).toHaveBeenCalledTimes(2);
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
    expect(faceUp(1, '🐍')).toBeInTheDocument();
  });

  it('locks the board while a flip request is pending', async () => {
    let settle!: (r: FlipResponse) => void;
    const flipAct: Act = jest.fn<Promise<FlipResponse>, [{ flip: number }]>(
      () => new Promise<FlipResponse>((resolve) => {
        settle = resolve;
      }),
    );
    setup(flipAct);

    fireEvent.click(screen.getByRole('button', { name: 'Card 1, face down' }));
    expect(screen.getByRole('button', { name: 'Card 1, face down' })).toHaveAttribute('aria-busy', 'true');

    // Taps on other cards are ignored while the first request is in flight.
    fireEvent.click(screen.getByRole('button', { name: 'Card 2, face down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Card 3, face down' }));
    expect(flipAct).toHaveBeenCalledTimes(1);

    await act(async () => settle({ index: 0, emoji: '🐍', moves: 0, pair: 'none', done: false }));
    expect(faceUp(1, '🐍')).toBeInTheDocument();

    await tap(2);
    expect(flipAct).toHaveBeenCalledTimes(2);
  });

  it('calls onDone exactly once, 900ms after the final match, with the server result', async () => {
    const { onDone } = setup();
    for (let pair = 0; pair < 8; pair++) {
      await tap(pair * 2 + 1);
      await tap(pair * 2 + 2);
    }

    expect(screen.getByRole('status')).toHaveTextContent('All pairs found in 8 moves');
    expect(onDone).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(899));
    expect(onDone).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(RESULT);

    // Nothing fires again, and taps are ignored after the win.
    act(() => jest.advanceTimersByTime(10000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows a rejection inline, flips the card back and lets the player retry', async () => {
    const server = makeServer();
    const flipAct: Act = jest
      .fn<Promise<FlipResponse>, [{ flip: number }]>()
      .mockRejectedValueOnce(new Error('Too fast'))
      .mockImplementation(server);
    const { onDone } = setup(flipAct);

    await tap(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Too fast');
    expect(faceDown(1)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    await tap(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(faceUp(1, '🐍')).toBeInTheDocument();
  });

  it('keeps the first card open when the second flip is rejected, then accepts the retry', async () => {
    const server = makeServer();
    const flipAct: Act = jest
      .fn<Promise<FlipResponse>, [{ flip: number }]>()
      .mockImplementationOnce(server) // card 1
      .mockRejectedValueOnce(new Error('Network down')) // card 3
      .mockImplementation(server);
    setup(flipAct);

    await tap(1);
    await tap(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceDown(3)).toBeInTheDocument();

    await tap(2); // the partner of card 1 completes the pair
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceUp(2, '🐍')).toBeInTheDocument();
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
  });

  it('shows a shimmer on a never-seen card while the server answers, then the emoji', async () => {
    const held = holdFlip(makeServer());
    const flipAct: Act = jest.fn<Promise<FlipResponse>, [{ flip: number }]>().mockImplementationOnce(held.request);
    setup(flipAct);

    fireEvent.click(faceDown(1));
    expect(screen.getByRole('button', { name: 'Card 1, face down' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Card 1, face down' }).querySelector('.memo-shimmer')).not.toBeNull();

    await held.finish();
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(faceUp(1, '🐍').querySelector('.memo-shimmer')).toBeNull();
    expect(faceUp(1, '🐍')).not.toHaveAttribute('aria-busy');
  });

  it('shows a cached face at once on a re-flip, before the server answers', async () => {
    const server = makeServer();
    const held = holdFlip(server);
    const flipAct: Act = jest
      .fn<Promise<FlipResponse>, [{ flip: number }]>()
      .mockImplementationOnce(server) // card 1: 🐍
      .mockImplementationOnce(server) // card 3: ⚛️, a mismatch
      .mockImplementationOnce(held.request); // card 1 again, held
    setup(flipAct);

    await tap(1);
    await tap(3);
    act(() => jest.advanceTimersByTime(MISMATCH_WAIT_MS));
    expect(faceDown(1)).toBeInTheDocument();

    fireEvent.click(faceDown(1));
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    expect(flipAct).toHaveBeenCalledTimes(3);
    expect(faceUp(1, '🐍')).toHaveAttribute('aria-busy', 'true');

    // Taps while the validating request is in flight are still ignored.
    fireEvent.click(faceDown(5));
    expect(flipAct).toHaveBeenCalledTimes(3);

    await held.finish();
    expect(faceUp(1, '🐍')).not.toHaveAttribute('aria-busy');
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 1');
  });

  it('replaces a cached face when the server reports a different one', async () => {
    const server = makeServer();
    const held = holdFlip(async (): Promise<FlipResponse> => ({ index: 0, emoji: '🔥', moves: 1, pair: 'none', done: false }));
    const flipAct: Act = jest
      .fn<Promise<FlipResponse>, [{ flip: number }]>()
      .mockImplementationOnce(server)
      .mockImplementationOnce(server)
      .mockImplementationOnce(held.request);
    setup(flipAct);

    await tap(1);
    await tap(3);
    act(() => jest.advanceTimersByTime(MISMATCH_WAIT_MS));

    fireEvent.click(faceDown(1));
    expect(faceUp(1, '🐍')).toBeInTheDocument();

    await held.finish();
    expect(faceUp(1, '🔥')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card 1, 🐍' })).not.toBeInTheDocument();
  });

  it('turns a cached card back face down when its request fails, and keeps the face', async () => {
    const server = makeServer();
    const flipAct: Act = jest
      .fn<Promise<FlipResponse>, [{ flip: number }]>()
      .mockImplementationOnce(server) // card 1: 🐍
      .mockImplementationOnce(server) // card 3: mismatch
      .mockRejectedValueOnce(new Error('Network down')) // card 1 again
      .mockImplementation(server);
    setup(flipAct);

    await tap(1);
    await tap(3);
    act(() => jest.advanceTimersByTime(MISMATCH_WAIT_MS));

    await tap(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(faceDown(1)).toBeInTheDocument();

    // The face is still cached, so the retry shows it at once.
    fireEvent.click(faceDown(1));
    expect(faceUp(1, '🐍')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(faceUp(1, '🐍')).toBeInTheDocument();
  });

  it('shows the clock from the first tap as display only', async () => {
    setup();
    expect(stat('Moves')).toHaveAttribute('aria-label', 'Moves: 0');
    expect(screen.getByRole('group', { name: /^Time:/ })).toHaveAttribute('aria-label', 'Time: 0s');

    await tap(1);
    act(() => jest.advanceTimersByTime(3000));
    expect(screen.getByRole('group', { name: /^Time:/ })).toHaveAttribute('aria-label', 'Time: 3s');
  });

  it('clears its clock and flip-back timers on unmount', async () => {
    const { unmount } = setup();
    await tap(1);
    await tap(3); // mismatch schedules a flip-back, and the clock is running
    // Other timers in the count belong to the test renderer, so compare against the baseline:
    // the component owns the clock interval and the mismatch timeout.
    const before = jest.getTimerCount();
    unmount();
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before - 2);
  });
});
