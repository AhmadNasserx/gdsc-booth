import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const DEFAULT_PAUSE_MESSAGE = 'The game is paused right now. The leaderboard is still live.';

/** Answers /api/status with the given state and every other call with an available name. */
function routeFetch(status: { paused: boolean; message?: string }) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/status')) return { ok: true, json: async () => status };
    if (url.startsWith('/api/names/check')) return { ok: true, json: async () => ({ available: true }) };
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
  }) as unknown as typeof fetch;
}

async function fillForm() {
  await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
  await userEvent.type(screen.getByLabelText(/phone number/i), '70 123 456');
  await userEvent.click(screen.getByLabelText(/I agree to be contacted on this number/i));
}

describe('paused home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    routeFetch({ paused: true, message: DEFAULT_PAUSE_MESSAGE });
  });

  it('shows a paused notice and keeps Start disabled', async () => {
    render(<Page />);
    const notice = await screen.findByText(/the game is paused right now/i);
    expect(notice).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('keeps Start disabled even when the name, phone number and consent are all complete', async () => {
    render(<Page />);
    await screen.findByText(/the game is paused right now/i);
    await fillForm();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/names/check?'), expect.anything()));
    expect(await screen.findByText('This name is available!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('shows the custom message from the server instead of the default text', async () => {
    routeFetch({ paused: true, message: 'Paused for the prize draw.' });
    render(<Page />);

    expect(await screen.findByText('Paused for the prize draw.')).toHaveAttribute('role', 'status');
    expect(screen.queryByText(/the game is paused right now/i)).not.toBeInTheDocument();
  });

  it('shows no paused notice when the game is open', async () => {
    routeFetch({ paused: false });
    render(<Page />);
    await fillForm();
    // Start is enabled only after /api/status has answered, so this also shows the status was read.
    await waitFor(() => expect(screen.getByRole('button', { name: /start/i })).toBeEnabled());

    expect(screen.queryByText(/the game is paused right now/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
