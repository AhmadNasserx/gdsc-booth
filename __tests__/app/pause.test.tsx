import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('@/lib/config') as { GAME_PAUSED: boolean };

beforeEach(() => {
  config.GAME_PAUSED = true;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ available: true }) })) as unknown as typeof fetch;
});

afterAll(() => {
  config.GAME_PAUSED = false;
});

describe('paused home page', () => {
  it('shows a paused notice and keeps Start disabled', async () => {
    render(<Page />);
    expect(screen.getByText(/the game is paused right now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('keeps Start disabled even when the name, phone number and consent are all complete', async () => {
    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    await userEvent.type(screen.getByLabelText(/phone number/i), '70 123 456');
    await userEvent.click(screen.getByLabelText(/I agree to be contacted on this number/i));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });
});
