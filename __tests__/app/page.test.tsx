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
    expect(screen.getByText(/deleted automatically after 24 hours/i)).toBeInTheDocument();
  });

  it('Start button is disabled for empty name', () => {
    render(<Page />);
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('navigates to /play on successful session creation', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'test-token' }),
    });
    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerToken')).toBe('test-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
  });

  it('shows error message when session creation fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
