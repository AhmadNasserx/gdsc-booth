import { render, screen } from '@testing-library/react';
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
});
