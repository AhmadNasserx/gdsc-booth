import { render, screen, fireEvent, act, createEvent } from '@testing-library/react';
import Wordle from '@/components/games/Wordle';

const WORD = 'REACT';
const HINT = 'Component-based UI library by Meta';
const REVEAL_MS = 1300;   // last tile settles
const WIN_HOLD_MS = 1500;
const LOSS_HOLD_MS = 2500;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function setup(onComplete = jest.fn()) {
  render(<Wordle word={WORD} hint={HINT} onComplete={onComplete} />);
  return onComplete;
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

/** Type a guess and press Enter, without waiting for the reveal. */
function submit(text: string) {
  typeText(text);
  pressEnter();
}

/** Type a guess, press Enter and let the flip reveal finish. */
function submitAndReveal(text: string) {
  submit(text);
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

const SCORE_CHIPS = ['300', '250', '200', '150', '100', '50'];

/** Fails if any rendered text shows a score, a maximum, or a "/200"-style ratio. */
function expectNoScoreLeaks() {
  const text = document.body.textContent ?? '';
  expect(text).not.toContain('/200');
  expect(text).not.toMatch(/max/i);
  for (const chip of SCORE_CHIPS) expect(text).not.toContain(chip);
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

  it('never reveals a score, a maximum or per-guess score chips', () => {
    setup();
    expectNoScoreLeaks();
    submitAndReveal('BYTES');
    expectNoScoreLeaks();
    submitAndReveal('BYTES');
    expectNoScoreLeaks();
    submit('BYTES');
    expectNoScoreLeaks();
    advance(REVEAL_MS);
    expectNoScoreLeaks();
    advance(LOSS_HOLD_MS);
    expectNoScoreLeaks();
  });

  it('never reveals a score on a win either', () => {
    const onComplete = setup();
    submitAndReveal('BYTES');
    submit(WORD);
    advance(REVEAL_MS);
    expectNoScoreLeaks();
    advance(WIN_HOLD_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expectNoScoreLeaks();
  });

  it('keeps the guess counter (attempts, not score)', () => {
    setup();
    expect(screen.getByText('0/6 guesses')).toBeInTheDocument();
    submitAndReveal('BYTES');
    expect(screen.getByText('1/6 guesses')).toBeInTheDocument();
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

  it('calls onComplete with the correct guess array when solved', () => {
    const onComplete = setup();
    submit(WORD);
    advance(REVEAL_MS + WIN_HOLD_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([WORD]);
  });

  it('calls onComplete after 6 failed guesses', () => {
    const onComplete = setup();
    for (let i = 0; i < 6; i++) submitAndReveal('BYTES');
    advance(LOSS_HOLD_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toHaveLength(6);
  });

  it('on-screen keyboard ENTER submits guess', () => {
    const onComplete = setup();
    typeText(WORD);
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    advance(REVEAL_MS + WIN_HOLD_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([WORD]);
  });

  it('short guess shakes the row and shows a message', () => {
    setup();
    typeText('RE');
    pressEnter();
    expect(rowEl(0)).toHaveClass('anim-shake');
    expect(screen.getByRole('status')).toHaveTextContent('Not enough letters');
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
    setup();
    typeText('REACT');
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Shift' });
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('0/6', { exact: false })).toBeInTheDocument();
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
    setup();
    typeText(WORD);
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    expect(screen.getByText('0/6', { exact: false })).toBeInTheDocument();
  });

  it('does not double submit on repeated Enter presses during the reveal', () => {
    const onComplete = setup();
    typeText(WORD);
    pressEnter();
    pressEnter();
    pressEnter();
    advance(REVEAL_MS + WIN_HOLD_MS + 1000);
    expect(screen.getByText('1/6', { exact: false })).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([WORD]);
  });

  it('locks input while the row reveals, then accepts it again', () => {
    setup();
    submit('BYTES');
    typeText('Z');
    expect(tileLabel(1, 0)).toBe('row 2 column 1, empty');
    advance(REVEAL_MS);
    fireEvent.keyDown(window, { key: 'Z' });
    expect(tileLabel(1, 0)).toBe('row 2 column 1, letter Z');
  });

  it('reveals each tile colour at its flip midpoint, staggered', () => {
    setup();
    submit('BYTES');
    // Tile 1 flips first and shows its colour at 150ms.
    advance(150);
    expect(tileLabel(0, 0)).toBe('row 1 column 1, letter B, absent');
    expect(tileLabel(0, 1)).toBe('row 1 column 2, letter Y');
    // Tile 2 shows its colour 250ms later.
    advance(250);
    expect(tileLabel(0, 1)).toBe('row 1 column 2, letter Y, absent');
  });

  it('keyboard key colours only update after the row finishes flipping', () => {
    setup();
    submit('BYTES');
    expect(keyLabel('B')).toBe('B');
    advance(REVEAL_MS - 1);
    expect(keyLabel('B')).toBe('B');
    advance(1);
    expect(keyLabel('B')).toBe('B, absent');
    expect(keyLabel('T')).toBe('T, present');
    expect(keyLabel('E')).toBe('E, present');
  });

  it('win shows an encouraging toast by guess count', () => {
    setup();
    submit(WORD);
    advance(REVEAL_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Genius!');
  });

  it('second-guess win shows "Magnificent!"', () => {
    setup();
    submitAndReveal('BYTES');
    submit(WORD);
    advance(REVEAL_MS);
    expect(screen.getByRole('status')).toHaveTextContent('Magnificent!');
  });

  it('calls onComplete only after the win hold, and never twice', () => {
    const onComplete = setup();
    submit(WORD);
    advance(REVEAL_MS + WIN_HOLD_MS - 1);
    expect(onComplete).not.toHaveBeenCalled();
    advance(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    advance(10000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('loss reveals the word', () => {
    const onComplete = setup();
    for (let i = 0; i < 6; i++) submitAndReveal('BYTES');
    expect(screen.getByRole('status')).toHaveTextContent(`The word was ${WORD}`);
    expect(onComplete).not.toHaveBeenCalled();
    advance(LOSS_HOLD_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows the hint chip only after two guesses', () => {
    setup();
    expect(screen.queryByText(new RegExp(HINT))).not.toBeInTheDocument();
    submitAndReveal('BYTES');
    expect(screen.queryByText(new RegExp(HINT))).not.toBeInTheDocument();
    submitAndReveal('BYTES');
    expect(screen.getByText(new RegExp(HINT))).toBeInTheDocument();
  });

  it('does not call onComplete after unmount', () => {
    const onComplete = jest.fn();
    const { unmount } = render(<Wordle word={WORD} hint={HINT} onComplete={onComplete} />);
    submit(WORD);
    advance(REVEAL_MS);
    unmount();
    advance(10000);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('skips flip timing and reveals colours at once when reduced motion is preferred', () => {
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
      const onComplete = setup();
      submit(WORD);
      expect(tileLabel(0, 4)).toBe('row 1 column 5, letter T, correct');
      advance(WIN_HOLD_MS);
      expect(onComplete).toHaveBeenCalledTimes(1);
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
