import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminLoginPage from '@/app/admin/login/page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }) }));

const PASSWORD = 'correct-horse-battery';

/** A failed response with the given status and body. The page reads the headers of every failure. */
function failed(status: number, body: unknown, retryAfter: string | null = null) {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => (name === 'Retry-After' ? retryAfter : null) },
    json: async () => body,
  };
}

function passwordInput() {
  return screen.getByLabelText('Password');
}

async function submitPassword(password = PASSWORD) {
  await userEvent.type(passwordInput(), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Admin sign-in page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders a password input with the Password label and a Sign in button', () => {
    render(<AdminLoginPage />);
    expect(passwordInput()).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('posts the password and goes to /admin on success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });

    render(<AdminLoginPage />);
    await submitPassword();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/admin'));
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ password: PASSWORD });
  });

  it('shows the server message in an alert on a wrong password and stays on the page', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failed(401, { error: 'Incorrect password.' }));

    render(<AdminLoginPage />);
    await submitPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password.');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('tells the admin to wait 5 minutes when sign-in is rate limited with Retry-After 300', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      failed(429, { error: 'Too many sign-in attempts.' }, '300'),
    );

    render(<AdminLoginPage />);
    await submitPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign-in attempts. Try again in 5 minutes.',
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the network message when the request cannot be sent', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<AdminLoginPage />);
    await submitPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server. Try again.');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('never writes the password to localStorage or sessionStorage', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(failed(401, { error: 'Incorrect password.' }));
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    render(<AdminLoginPage />);
    await submitPassword();
    await screen.findByRole('alert');

    expect(setItem).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining(PASSWORD));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
