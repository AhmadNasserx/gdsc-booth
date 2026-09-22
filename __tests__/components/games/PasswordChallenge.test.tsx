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

  it('calls onComplete with strength score on Lock In', async () => {
    const onComplete = jest.fn();
    render(<PasswordChallenge onComplete={onComplete} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'MyP@ssw0rd123!');
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('does not call onComplete again after locked', async () => {
    const onComplete = jest.fn();
    render(<PasswordChallenge onComplete={onComplete} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'test1234');
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
