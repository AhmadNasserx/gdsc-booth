import { render, screen, fireEvent, act, createEvent } from '@testing-library/react';
import Wordle from '@/components/games/Wordle';
import type { GuessResponse, LetterState, RunResult } from '@/lib/apiTypes';

const WORD = 'REACT';
const HINT = 'Component-based UI library by Meta';
const REVEAL_MS = 1300;   // last tile settles
const WIN_HOLD_MS = 1500;
const LOSS_HOLD_MS = 2500;

// Server-side grading is mocked: BYTES against REACT has no duplicate letters,
// so each colour below is unambiguous.
const BYTES_STATES: LetterState[] = ['absent', 'absent', 'present', 'present', 'absent'];
const CORRECT_STATES: LetterState[] = ['correct', 'correct', 'correct', 'correct', 'correct'];

const RESULT: RunResult = {
  game: 'wordle',
  score: 640,
  best: 640,
  improved: true,
  total: 640,
  rank: 1,
  gamesPlayed: ['wordle'],
};

type Server = jest.Mock;

function miss(): GuessResponse {
  return { states: BYTES_STATES, solved: false, done: false };
}

function win(): GuessResponse {
  return { states: CORRECT_STATES, solved: true, done: true, result: RESULT };
}

function loss(): GuessResponse {
  return { states: BYTES_STATES, solved: false, done: true, word: WORD, result: RESULT };
}

/** A server that answers each call with the given responses, in order. */
function serve(...responses: GuessResponse[]): Server {
  const server: Server = jest.fn();
  responses.forEach((r) => server.mockResolvedValueOnce(r));
  return server;
}

/** A server whose answers the test resolves by hand. */
function slowServer(): { server: Server; answer: (r: GuessResponse) => void; fail: (e: Error) => void } {
  let answer!: (r: GuessResponse) => void;
  let fail!: (e: Error) => void;
  const server: Server = jest.fn(
    () => new Promise<GuessResponse>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    }),
  );
  return { server, answer: (r) => answer(r), fail: (e) => fail(e) };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function setup(server: Server = jest.fn().mockResolvedValue(miss()), onDone: jest.Mock = jest.fn()) {
  render(<Wordle act={server} onDone={onDone} />);
  return { server, onDone };
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function typeText(text: string) {
  for (const ch of text) fireEvent.keyDown(window, { key: ch });
}

function pressEnter() {
  fireEvent.keyDown(window, { key: 'Enter' });
}

/** Press Enter and let any resolved server answer run. */
async function pressEnterAndFlush() {
  await act(async () => {
    pressEnter();
  });
}

/** Type a guess and press Enter, then let the server answer (no reveal wait). */
async function submit(text: string) {
  typeText(text);
  await pressEnterAndFlush();
}

/** Type a guess, let the server answer, then let the flip reveal finish. */
async function submitAndReveal(text: string) {
  await submit(text);
  advance(REVEAL_MS);
}

function tile(row: number, col: number): HTMLElement {
  return screen.getAllByRole('gridcell')[row * 5 + col];
}

function tileLabel(row: number, col: number): string {
  return tile(row, col).getAttribute('aria-label') ?? '';
}

function rowEl(row: number): HTMLElement {
  return screen.getAllByRole('row')[row];
}

/** Fails if any rendered text shows a score, a maximum, or a "/6"-style ratio. */
function expectNoScoreLeaks() {
  const text = document.body.textContent ?? '';
  expect(text).not.toContain('/6');
  expect(text).not.toMatch(/max/i);
  expect(text).not.toMatch(/\bout of\b/i);
  expect(text).not.toMatch(/\/\s*\d/);
}

/** Accessible name of an on-screen letter key (changes once the key is coloured). */
function keyLabel(letter: string): string {
  const key = screen.getAllByRole('button').find((b) => b.textContent === letter);
  return key?.getAttribute('aria-label') ?? '';
}

describe('Wordle', () => {
  it('renders the game grid and keyboard', () => {
    setup();
    expect(screen.getByText('Tech Wordle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Q' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter' })).toHaveTextContent('ENTER');
    expect(screen.getByRole('button', { name: 'Backspace' })).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(30);
  });

  it('never reveals a score, a maximum or a ratio, through a whole game', async () => {
    setup(serve(miss(), miss(), miss(), miss(), miss(), loss()));
    expectNoScoreLeaks();
    for (let i = 0; i < 5; i++) {
      await submitAndReveal('BYTES');
      expectNoScoreLeaks();
    }
    await submit('BYTES');
    expectNoScoreLeaks();
    advance(REVEAL_MS);
    expectNoScoreLeaks();
    advance(LOSS_HOLD_MS);
    expectNoScoreLeaks();
  });

  it('never reveals a score or maximum on a win either', async () => {
    const { onDone } = setup(serve(miss(), win()));
    await submitAndReveal('BYTES');
    await submit(WORD);
    advance(REVEAL_MS);
    expectNoScoreLeaks();
    advance(WIN_HOLD_MS);
    expect(onDone).toHaveBeenCalledTimes(1);
    expectNoScoreLeaks();
  });

  it('counts attempts without showing a limit', async () => {
    setup();
    expect(screen.getByText('0 guesses')).toBeInTheDocument();
    await submitAndReveal('BYTES');
    expect(screen.getByText('1 guess')).toBeInTheDocument();
    expect(screen.queryByText(/\/6/)).not.toBeInTheDocument();
  });

  it('typing letters fills the active row (physical keys, case-insensitive)', () => {
    setup();
    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.keyDown(window, { key: 'e' });
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter R');
    expect(tileLabel(0, 1)).toBe('row 1 column 2, letter E');
    expect(tileLabel(0, 2)).toBe('row 1 column 3, empty');
  });

  it('ignores letters past the 5th column', () => {
    setup();
    typeText('REACTX');
    expect(tileLabel(0, 4)).toBe('row 1 column 5, letter T');
    expect(screen.getByRole('grid').textContent).not.toContain('X');
  });

  it('backspace removes a letter', () => {
    setup();
    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(tileLabel(0, 0)).toBe('row 1 column 1, empty');
  });

  it('on-screen keys type letters and backspace', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'R' }));
    fireEvent.click(screen.getByRole('button', { name: 'E' }));
    fireEvent.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter R');
    expect(tileLabel(0, 1)).toBe('row 1 column 2, empty');
  });

  it('sends the typed guess to the server, and only once per Enter', async () => {
    const { server } = setup(serve(miss()));
    await submit('BYTES');
    expect(server).toHaveBeenCalledTimes(1);
    expect(server).toHaveBeenCalledWith({ guess: 'BYTES' });
  });

  it('applies server states to the row after the flip and colours the keys', async () => {
    setup(serve(miss()));
    await submit('BYTES');
    // Still flipping: no colour yet on the first tile.
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B');
    advance(REVEAL_MS);
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B, absent');
    expect(tileLabel(0, 2)).toBe('row 1 column 3, letter T, present');
    expect(tileLabel(0, 3)).toBe('row 1 column 4, letter E, present');
    expect(tileLabel(0, 4)).toBe('row 1 column 5, letter S, absent');
    expect(keyLabel('T')).toBe('T, present');
    expect(keyLabel('E')).toBe('E, present');
    expect(keyLabel('B')).toBe('B, absent');
  });

  it('reveals each tile colour at its flip midpoint, staggered', async () => {
    setup(serve(miss()));
    await submit('BYTES');
    // Tile 1 flips first and shows its colour at 150ms.
    advance(150);
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B, absent');
    expect(tileLabel(0, 1)).toBe('row 1 column 2, letter Y');
    // Tile 2 shows its colour 250ms later.
    advance(250);
    expect(tileLabel(0, 1)).toBe('row 1 column 2, letter Y, absent');
  });

  it('keyboard key colours only update after the row finishes flipping', async () => {
    setup(serve(miss()));
    await submit('BYTES');
    expect(keyLabel('B')).toBe('B');
    advance(REVEAL_MS - 1);
    expect(keyLabel('B')).toBe('B');
    advance(1);
    expect(keyLabel('B')).toBe('B, absent');
    expect(keyLabel('T')).toBe('T, present');
    expect(keyLabel('E')).toBe('E, present');
  });

  it('on-screen keyboard ENTER submits the guess', async () => {
    const { server } = setup(serve(miss()));
    typeText('BYTES');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    });
    expect(server).toHaveBeenCalledWith({ guess: 'BYTES' });
  });

  it('short guess shakes the row, shows a message and never calls the server', () => {
    const { server } = setup();
    typeText('RE');
    pressEnter();
    expect(rowEl(0)).toHaveClass('anim-shake');
    expect(screen.getByRole('status')).toHaveTextContent('Not enough letters');
    expect(server).not.toHaveBeenCalled();
    advance(500);
    expect(rowEl(0)).not.toHaveClass('anim-shake');
  });

  it('ignores ctrl, meta and alt modified keys', () => {
    setup();
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'e', metaKey: true });
    fireEvent.keyDown(window, { key: 'a', altKey: true });
    fireEvent.keyDown(window, { key: 'Backspace', ctrlKey: true });
    expect(tileLabel(0, 0)).toBe('row 1 column 1, empty');
  });

  it('ignores Enter with a modifier and non-letter keys', () => {
    const { server } = setup();
    typeText('REACT');
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Shift' });
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(server).not.toHaveBeenCalled();
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter R');
  });

  it('prevents default for Enter, Backspace and Space', () => {
    setup();
    for (const key of ['Enter', 'Backspace', ' ']) {
      const event = createEvent.keyDown(window, { key });
      fireEvent(window, event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('ignores repeated Enter so holding the key does not resubmit', () => {
    const { server } = setup();
    typeText(WORD);
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    expect(server).not.toHaveBeenCalled();
  });

  it('shows the pending state and does not flip until the server answers', async () => {
    const { server, answer } = slowServer();
    setup(server);
    typeText('BYTES');
    await pressEnterAndFlush();

    expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'true');
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B');

    advance(REVEAL_MS + 1000);
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B');

    await act(async () => {
      answer(miss());
    });
    expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'false');
    advance(REVEAL_MS);
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B, absent');
  });

  it('does not double submit while a guess is pending', async () => {
    const { server } = slowServer();
    setup(server);
    typeText('BYTES');
    pressEnter();
    pressEnter();
    await pressEnterAndFlush();
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    expect(server).toHaveBeenCalledTimes(1);
  });

  it('does not double submit on repeated Enter presses during the reveal', async () => {
    const { onDone } = setup(serve(win()));
    typeText(WORD);
    await pressEnterAndFlush();
    pressEnter();
    pressEnter();
    advance(REVEAL_MS + WIN_HOLD_MS + 1000);
    expect(screen.getByText('1 guess')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(RESULT);
  });

  it('ignores typing and backspace while a guess is pending', async () => {
    const { server } = slowServer();
    setup(server);
    typeText('BYTES');
    await pressEnterAndFlush();
    typeText('Z');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(tileLabel(0, 4)).toBe('row 1 column 5, letter S');
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B');
  });

  it('locks input while the row reveals, then accepts it again', async () => {
    setup(serve(miss()));
    await submit('BYTES');
    typeText('Z');
    expect(tileLabel(1, 0)).toBe('row 2 column 1, empty');
    advance(REVEAL_MS);
    fireEvent.keyDown(window, { key: 'Z' });
    expect(tileLabel(1, 0)).toBe('row 2 column 1, letter Z');
  });

  it('win shows an encouraging toast by guess count', async () => {
    setup(serve(win()));
    await submit(WORD);
    advance(REVEAL_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Genius!');
  });

  it('second-guess win shows "Magnificent!"', async () => {
    setup(serve(miss(), win()));
    await submitAndReveal('BYTES');
    await submit(WORD);
    advance(REVEAL_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Magnificent!');
  });

  it('win calls onDone once, after the win hold counted from the final flip', async () => {
    const { onDone } = setup(serve(win()));
    await submit(WORD);
    advance(REVEAL_MS + WIN_HOLD_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(RESULT);
    advance(10000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('loss reveals the word in the toast and calls onDone after the loss hold', async () => {
    const { onDone } = setup(serve(miss(), miss(), miss(), miss(), miss(), loss()));
    for (let i = 0; i < 5; i++) await submitAndReveal('BYTES');
    await submit('BYTES');
    advance(REVEAL_MS);
    expect(screen.getByRole('status')).toHaveTextContent(`The word was ${WORD}`);
    expect(onDone).not.toHaveBeenCalled();
    advance(LOSS_HOLD_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(RESULT);
    advance(10000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows the hint chip only once the server includes a hint', async () => {
    setup(serve(miss(), { ...miss(), hint: HINT }));
    await submitAndReveal('BYTES');
    expect(screen.queryByText(new RegExp(HINT))).not.toBeInTheDocument();
    await submitAndReveal('BYTES');
    expect(screen.getByText(new RegExp(HINT))).toBeInTheDocument();
  });

  it('on rejection shows the message, keeps the letters and lets the player retry', async () => {
    const server: Server = jest.fn()
      .mockRejectedValueOnce(new Error('Too fast'))
      .mockResolvedValueOnce(miss());
    setup(server);

    await submit('BYTES');
    expect(screen.getByRole('status')).toHaveTextContent('Too fast');
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B');
    expect(tileLabel(0, 4)).toBe('row 1 column 5, letter S');
    expect(screen.getByText('0 guesses')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'false');

    // Input is unlocked again: the same guess goes out and no row was consumed.
    await pressEnterAndFlush();
    expect(server).toHaveBeenCalledTimes(2);
    expect(server).toHaveBeenNthCalledWith(2, { guess: 'BYTES' });
    advance(REVEAL_MS);
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B, absent');
    expect(screen.getByText('1 guess')).toBeInTheDocument();
  });

  it('falls back to a generic message when the rejection has no text', async () => {
    const server: Server = jest.fn().mockRejectedValueOnce('boom');
    setup(server);
    await submit('BYTES');
    expect(screen.getByRole('status')).toHaveTextContent('Something went wrong');
  });

  it('does not call onDone after unmount, even when the answer arrives late', async () => {
    const { server, answer } = slowServer();
    const onDone = jest.fn();
    const { unmount } = render(<Wordle act={server} onDone={onDone} />);
    typeText(WORD);
    await pressEnterAndFlush();
    unmount();
    await act(async () => {
      answer(win());
    });
    advance(10000);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('does not call onDone after unmount during the win hold', async () => {
    const onDone = jest.fn();
    const { unmount } = render(<Wordle act={serve(win())} onDone={onDone} />);
    typeText(WORD);
    await pressEnterAndFlush();
    advance(REVEAL_MS);
    unmount();
    advance(10000);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('skips flip timing and reveals colours at once when reduced motion is preferred', async () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia;

    try {
      const { onDone } = setup(serve(win()));
      await submit(WORD);
      expect(tileLabel(0, 4)).toBe('row 1 column 5, letter T, correct');
      advance(WIN_HOLD_MS);
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = original;
    }
  });

  it('keeps focus off the on-screen keys', () => {
    setup();
    const notPrevented = fireEvent.mouseDown(screen.getByRole('button', { name: 'Q' }));
    expect(notPrevented).toBe(false);
  });
});
