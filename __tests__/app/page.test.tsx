import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

global.fetch = jest.fn();

describe('Name Entry Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders name input and consent notice', () => {
    render(<Page />);
    expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument();
    expect(screen.getByText(/deleted after 48 hours/i)).toBeInTheDocument();
  });

  it('explains that one game is scored and the rest are practice', () => {
    render(<Page />);
    expect(screen.getByText(/six mini-games/i)).toBeInTheDocument();
    expect(screen.getByText(/pick one to score/i)).toBeInTheDocument();
  });

  it('Start button is disabled when name is empty', () => {
    render(<Page />);
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('clears a game picked in a previous session when a new session starts', async () => {
    sessionStorage.setItem('playerGame', 'bugs');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'new-token', questions: {} }),
      });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    const startBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /start/i });
      expect(btn).not.toBeDisabled();
      return btn;
    });
    fireEvent.click(startBtn);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerGame')).toBeNull();
    expect(sessionStorage.getItem('playerToken')).toBe('new-token');
  });

  it('navigates to /play on successful session creation', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'test-token', questions: {} }),
      });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');

    // Wait for the debounced availability check to complete and enable the button
    const startBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /start/i });
      expect(btn).not.toBeDisabled();
      return btn;
    });

    fireEvent.click(startBtn);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerToken')).toBe('test-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
  });

  it('shows error message when session creation fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ available: true }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Server error' }) });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');

    const startBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /start/i });
      expect(btn).not.toBeDisabled();
      return btn;
    });

    fireEvent.click(startBtn);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
