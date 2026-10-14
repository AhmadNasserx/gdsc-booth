import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuccessScreen from '@/components/SuccessScreen';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }));

const base = { name: 'Ahmad', total: 640, rank: 3, game: 'memory' as const, best: 640, improved: true };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  global.fetch = jest.fn();
});

describe('SuccessScreen', () => {
  it('shows the name, the game, the score in points and the rank', () => {
    render(<SuccessScreen {...base} />);
    expect(screen.getByText('Well done, Ahmad!')).toBeInTheDocument();
    expect(screen.getByText('Memory Match')).toBeInTheDocument();
    expect(screen.getByText('640')).toBeInTheDocument();
    expect(screen.getByText('pts')).toBeInTheDocument();
    expect(screen.getByText('640').parentElement).toHaveTextContent('640 pts');
    expect(screen.getByText("You're #3 on the leaderboard")).toBeInTheDocument();
  });

  it('shows the personal best message when this run became the best', () => {
    render(<SuccessScreen {...base} improved />);
    expect(screen.getByText('🎉 New personal best!')).toBeInTheDocument();
    expect(screen.queryByText(/your best is/i)).not.toBeInTheDocument();
  });

  it('shows the existing best with an encouraging prompt when this run did not improve on it', () => {
    render(<SuccessScreen {...base} total={500} best={800} improved={false} />);
    expect(screen.getByText(/Your best is 800 pts\./)).toBeInTheDocument();
    expect(screen.getByText('Can you beat it?')).toBeInTheDocument();
    expect(screen.queryByText('🎉 New personal best!')).not.toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('shows the game emoji, hidden from assistive tech', () => {
    const { container } = render(<SuccessScreen {...base} game="bugs" total={100} rank={1} best={100} />);
    expect(container).toHaveTextContent('🐞 Bug Hunter');
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('keeps the Join GDSC and leaderboard links', () => {
    render(<SuccessScreen {...base} game="riddles" />);
    expect(screen.getByRole('link', { name: /join gdsc/i })).toHaveAttribute(
      'href',
      'https://forms.gle/N5UBuhErH9wqjpV87',
    );
    expect(screen.getByRole('link', { name: /view live leaderboard/i })).toHaveAttribute('href', '/leaderboard');
  });
});

describe('SuccessScreen: no maximum shown', () => {
  it.each([
    ['improved run', { total: 640, best: 640, improved: true }],
    ['run that did not improve', { total: 500, best: 800, improved: false }],
  ])('never shows a maximum, a "/ 1000" or an "out of" for the %s', (_label, props) => {
    const { container } = render(<SuccessScreen {...base} {...props} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('1000');
    expect(text).not.toContain('/ 1000');
    expect(text).not.toMatch(/max/i);
    expect(text).not.toMatch(/out of/i);
  });
});

describe('SuccessScreen: Play again', () => {
  it('starts a new session with the same name and navigates to /play', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'new-token', questions: { wordleWord: 'CRANE' } }),
    });
    render(<SuccessScreen {...base} />);

    fireEvent.click(screen.getByRole('button', { name: /play again/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/session');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Ahmad',
      playerKey: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(sessionStorage.getItem('playerToken')).toBe('new-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
  });

  it('disables the button and shows a loading label while the session is starting', async () => {
    let resolve: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    render(<SuccessScreen {...base} />);

    fireEvent.click(screen.getByRole('button', { name: /play again/i }));

    const busy = await screen.findByRole('button', { name: /starting/i });
    expect(busy).toBeDisabled();
    resolve({ ok: true, json: async () => ({ token: 't', questions: {} }) });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
  });

  it('shows the error inline, re-enables the button and does not navigate', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Display name already taken. Choose another.' }),
    });
    render(<SuccessScreen {...base} />);

    fireEvent.click(screen.getByRole('button', { name: /play again/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Display name already taken. Choose another.');
    expect(screen.getByRole('button', { name: /play again/i })).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an error when the request itself fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<SuccessScreen {...base} />);

    fireEvent.click(screen.getByRole('button', { name: /play again/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
