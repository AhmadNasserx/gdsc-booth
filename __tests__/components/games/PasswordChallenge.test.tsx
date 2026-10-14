import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordChallenge from '@/components/games/PasswordChallenge';

describe('PasswordChallenge', () => {
  it('renders password input and Lock In button', () => {
    render(<PasswordChallenge onComplete={jest.fn()} />);
    expect(screen.getByPlaceholderText(/type your password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lock in/i })).toBeInTheDocument();
  });

  it('Lock In is disabled when password is empty', () => {
    render(<PasswordChallenge onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: /lock in/i })).toBeDisabled();
  });

  it('calls onComplete with the password string on lock', async () => {
    const onComplete = jest.fn();
    render(<PasswordChallenge onComplete={onComplete} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'XkP9#mRv2!LqT7@wNb');
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    expect(onComplete).toHaveBeenCalledWith('XkP9#mRv2!LqT7@wNb');
  });

  it('does not call onComplete again after locked', async () => {
    const onComplete = jest.fn();
    render(<PasswordChallenge onComplete={onComplete} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'test1234');
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    // Button is now "Locked In — X pts ✓" and disabled — second click is a no-op
    fireEvent.click(screen.getByRole('button', { name: /locked in/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows points without any "/200" maximum', async () => {
    const { container } = render(<PasswordChallenge onComplete={jest.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'XkP9#mRv2!LqT7@wNbZ&j$Yh');
    expect(screen.getByText('200 pts')).toBeInTheDocument();
    expectNoMaximum(container);
  });

  it('locked-in label shows points without a maximum', async () => {
    render(<PasswordChallenge onComplete={jest.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'XkP9#mRv2!LqT7@wNbZ&j$Yh');
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    expect(screen.getByRole('button', { name: 'Locked In — 200 pts ✓' })).toBeDisabled();
    expectNoMaximum(document.body);
  });

  it('never renders a maximum, a ratio or a full bar at any stage', async () => {
    const { container } = render(<PasswordChallenge onComplete={jest.fn()} />);
    expectNoMaximum(container);
    const input = screen.getByPlaceholderText(/type your password/i);
    for (const pw of ['a', 'Password1', 'XkP9#mRv2!LqT7@wNbZ&j$Yh', 'XkP9#mRv2!LqT7@wNbZ&j$Yh-XkP9#mRv2!LqT7@']) {
      await userEvent.clear(input);
      await userEvent.type(input, pw);
      expectNoMaximum(container);
      expect(barWidth(container)).toBeLessThan(90);
    }
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    expectNoMaximum(container);
  });

  it('strength bar is empty with no password and grows without reaching full', async () => {
    const { container } = render(<PasswordChallenge onComplete={jest.fn()} />);
    expect(barWidth(container)).toBe(0);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'XkP9#mRv2!LqT7@wNbZ&j$Yh');
    // score 200 maps to ~77.7%, well short of 100%
    expect(barWidth(container)).toBeGreaterThan(75);
    expect(barWidth(container)).toBeLessThan(80);
  });

  it('strength bar keeps the Excellent label and colour at high scores', async () => {
    render(<PasswordChallenge onComplete={jest.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'XkP9#mRv2!LqT7@wNbZ&j$Yh');
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
