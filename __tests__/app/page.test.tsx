import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

global.fetch = jest.fn();

const PLAYER_KEY = /^[0-9a-f]{64}$/;

function availableResponse(extra: Record<string, unknown> = {}) {
  return { ok: true, json: async () => ({ available: true, ...extra }) };
}

async function startButtonEnabled() {
  return waitFor(() => {
    const btn = screen.getByRole('button', { name: /start/i });
    expect(btn).not.toBeDisabled();
    return btn;
  });
}

describe('Name Entry Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
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

  it('tells players they can play again and that their best score counts', () => {
    render(<Page />);
    expect(screen.getByText(/you can play again any time, and only your best score counts/i)).toBeInTheDocument();
  });

  it('Start button is disabled when name is empty', () => {
    render(<Page />);
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('prefills the input with the name saved last time', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    (global.fetch as jest.Mock).mockResolvedValue(availableResponse());
    render(<Page />);
    expect(await screen.findByDisplayValue('Ahmad')).toBeInTheDocument();
  });

  it('shows the welcome-back message for a name this browser already holds', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    (global.fetch as jest.Mock).mockResolvedValue(availableResponse({ mine: true }));
    render(<Page />);

    expect(await screen.findByText('Welcome back, Ahmad! Your best score is kept.')).toBeInTheDocument();
    expect(await startButtonEnabled()).toBeEnabled();
  });

  it('sends the player key with the availability check', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(availableResponse());
    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const params = new URL(url, 'http://localhost').searchParams;
    expect(url.startsWith('/api/names/check?')).toBe(true);
    expect(params.get('name')).toBe('Ahmad');
    // The key goes in a header so it never reaches the query string or access logs
    expect(params.has('playerKey')).toBe(false);
    expect(url).not.toMatch(PLAYER_KEY);
    expect((init.headers as Record<string, string>)['x-player-key']).toMatch(PLAYER_KEY);
  });

  it('shows the taken message when the name belongs to someone else', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ available: false }) });
    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');

    expect(await screen.findByText('This name is already taken — choose another.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('clears a game picked in a previous session when a new session starts', async () => {
    sessionStorage.setItem('playerGame', 'bugs');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'new-token', questions: {} }),
      });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerGame')).toBeNull();
    expect(sessionStorage.getItem('playerToken')).toBe('new-token');
  });

  it('navigates to /play on successful session creation', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'test-token', questions: {} }),
      });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');

    // Wait for the debounced availability check to complete and enable the button
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerToken')).toBe('test-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
  });

  it('posts the name and a 64-character hex player key, and remembers the name', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 't', questions: {} }) });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(await startButtonEnabled());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(url).toBe('/api/session');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({ name: 'Ahmad', playerKey: expect.stringMatching(PLAYER_KEY) });
    expect(localStorage.getItem('gdscPlayerKey')).toBe(body.playerKey);
    expect(localStorage.getItem('gdscPlayerName')).toBe('Ahmad');
  });

  it('starts a returning player with their saved name and the welcome-back status', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse({ mine: true }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 't', questions: {} }) });

    render(<Page />);
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).name).toBe('Ahmad');
  });

  it('shows error message when session creation fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Server error' }) });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(await startButtonEnabled());

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('marks the name taken when the server rejects it with 409', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Display name already taken. Choose another.' }),
      });

    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(await startButtonEnabled());

    expect(await screen.findByRole('alert')).toHaveTextContent('Display name already taken');
    expect(await screen.findByText('This name is already taken — choose another.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });
});
