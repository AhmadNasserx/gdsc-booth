import { render, screen, fireEvent, act } from '@testing-library/react';
import PasswordChallenge from '@/components/games/PasswordChallenge';
import { calcPasswordScore } from '@/lib/scoring';
import type { PasswordResponse, RunResult } from '@/lib/apiTypes';

const STRONG = 'XkP9#mRv2!LqT7@wNbZ&j$Yh';

const RESULT: RunResult = {
  game: 'password',
  score: 150,
  best: 150,
  improved: true,
  total: 150,
  rank: 2,
  gamesPlayed: ['password'],
};

type Act = jest.Mock<Promise<PasswordResponse>, [{ password: string }]>;

/** Stand-in for the server: scores the password and finalises the run. */
function makeAct(): Act {
  return jest.fn<Promise<PasswordResponse>, [{ password: string }]>(async ({ password }) => ({
    score: calcPasswordScore(password),
    done: true,
    result: RESULT,
  }));
}

function setup(flipAct: Act = makeAct(), onDone = jest.fn()) {
  const utils = render(<PasswordChallenge act={flipAct} onDone={onDone} />);
  return { ...utils, act: flipAct, onDone, input: screen.getByPlaceholderText(/type your password/i) };
}

/** Changes the input value (fireEvent keeps these tests free of userEvent timers). */
function typePassword(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

async function lockIn() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PasswordChallenge', () => {
  it('renders password input and Lock In button, with Lock In disabled while empty', () => {
    const { input } = setup();
    expect(input).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lock in/i })).toBeDisabled();
  });

  it('sends the password to act on Lock In and shows the server score', async () => {
    const { act: flipAct, input } = setup();
    typePassword(input, STRONG);
    await lockIn();

    expect(flipAct).toHaveBeenCalledTimes(1);
    expect(flipAct).toHaveBeenCalledWith({ password: STRONG });
    const lockedButton = screen.getByRole('button', { name: `Locked In — ${calcPasswordScore(STRONG)} pts ✓` });
    expect(lockedButton).toBeDisabled();
    expect(input).toBeDisabled();
  });

  it('calls onDone once with the server result after the locked-in state has been shown', async () => {
    const { onDone, input } = setup();
    typePassword(input, STRONG);
    await lockIn();
    expect(onDone).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(899));
    expect(onDone).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(RESULT);

    // A second click on the locked button is a no-op, and nothing fires again.
    fireEvent.click(screen.getByRole('button', { name: /locked in/i }));
    act(() => jest.advanceTimersByTime(10000));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not submit twice while the request is pending', async () => {
    let settle!: (r: PasswordResponse) => void;
    const flipAct: Act = jest.fn<Promise<PasswordResponse>, [{ password: string }]>(
      () => new Promise<PasswordResponse>((resolve) => {
        settle = resolve;
      }),
    );
    const { input } = setup(flipAct);
    typePassword(input, STRONG);

    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    const pendingButton = screen.getByRole('button', { name: 'Locking in…' });
    expect(pendingButton).toBeDisabled();
    expect(input).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(flipAct).toHaveBeenCalledTimes(1);

    await act(async () => settle({ score: 200, done: true, result: RESULT }));
    expect(screen.getByRole('button', { name: 'Locked In — 200 pts ✓' })).toBeDisabled();
    expect(flipAct).toHaveBeenCalledTimes(1);
  });

  it('shows a rejection inline and re-enables the form so the player can retry', async () => {
    const onDone = jest.fn();
    const flipAct: Act = jest
      .fn<Promise<PasswordResponse>, [{ password: string }]>()
      .mockRejectedValueOnce(new Error('Run expired. Start a new game.'))
      .mockImplementation(async ({ password }) => ({ score: calcPasswordScore(password), done: true, result: RESULT }));
    const { input } = setup(flipAct, onDone);
    typePassword(input, STRONG);

    await lockIn();
    expect(screen.getByRole('alert')).toHaveTextContent('Run expired. Start a new game.');
    expect(screen.getByRole('button', { name: /lock in/i })).toBeEnabled();
    expect(input).toBeEnabled();
    expect(onDone).not.toHaveBeenCalled();

    await lockIn();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Locked In — ${calcPasswordScore(STRONG)} pts ✓` })).toBeDisabled();
    expect(flipAct).toHaveBeenCalledTimes(2);

    act(() => jest.advanceTimersByTime(900));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows points without any "/200" maximum', () => {
    const { container, input } = setup();
    typePassword(input, STRONG);
    expect(screen.getByText('200 pts')).toBeInTheDocument();
    expectNoMaximum(container);
  });

  it('locked-in label shows points without a maximum', async () => {
    const { input } = setup();
    typePassword(input, STRONG);
    await lockIn();
    expect(screen.getByRole('button', { name: 'Locked In — 200 pts ✓' })).toBeDisabled();
    expectNoMaximum(document.body);
  });

  it('never renders a maximum, a ratio or a full bar at any stage', async () => {
    const { container, input } = setup();
    expectNoMaximum(container);
    for (const pw of ['a', 'Password1', STRONG, `${STRONG}-XkP9#mRv2!LqT7@`]) {
      typePassword(input, pw);
      expectNoMaximum(container);
      expect(barWidth(container)).toBeLessThan(90);
    }
    await lockIn();
    expectNoMaximum(container);
  });

  it('strength bar is empty with no password and grows without reaching full', () => {
    const { container, input } = setup();
    expect(barWidth(container)).toBe(0);
    typePassword(input, STRONG);
    // score 200 maps to ~77.7%, well short of 100%
    expect(barWidth(container)).toBeGreaterThan(75);
    expect(barWidth(container)).toBeLessThan(80);
  });

  it('strength bar keeps the Excellent label and colour at high scores', () => {
    const { input } = setup();
    typePassword(input, STRONG);
    expect(screen.getByText(/Excellent/)).toBeInTheDocument();
  });
});

/** Fails if the rendered output shows a "/200" ratio, a maximum, or the word "max". */
function expectNoMaximum(root: HTMLElement) {
  const text = root.textContent ?? '';
  expect(text).not.toContain('/200');
  expect(text).not.toMatch(/max/i);
}

/** Width (percent) of the strength bar fill. */
function barWidth(root: HTMLElement): number {
  const fill = root.querySelector<HTMLElement>('.h-full');
  return parseFloat(fill?.style.width ?? '0');
}
