import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PlayPage from '@/app/play/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
global.fetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe('Play Page', () => {
  it('redirects to / when no session in sessionStorage', async () => {
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('renders game hub with TabBar when session exists', () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    render(<PlayPage />);
    expect(screen.getByText(/emoji/i)).toBeInTheDocument();
  });

  it('Submit button is disabled until all 4 games completed', () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    render(<PlayPage />);
    expect(screen.getByRole('button', { name: /submit score/i })).toBeDisabled();
  });
});
