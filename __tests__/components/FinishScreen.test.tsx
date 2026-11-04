import { render, screen } from '@testing-library/react';
import FinishScreen from '@/components/FinishScreen';
import { feedback } from '@/lib/feedback';

jest.mock('@/lib/feedback', () => ({ feedback: jest.fn() }));

// Reports reduced motion so CountUp shows the total at once and the assertions do not race a frame clock.
const originalMatchMedia = window.matchMedia;
function mockReducedMotion() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

beforeAll(() => mockReducedMotion());
afterAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
});
beforeEach(() => jest.clearAllMocks());

describe('FinishScreen', () => {
  it('greets the player by name', () => {
    render(<FinishScreen name="Layla" total={1200} rank={3} />);
    expect(screen.getByRole('heading', { name: "That's all three games, Layla!" })).toBeInTheDocument();
  });

  it('shows the total points', () => {
    render(<FinishScreen name="Layla" total={1200} rank={3} />);
    expect(screen.getByText('1200 pts')).toBeInTheDocument();
  });

  it('shows the rank when the player is on the board', () => {
    render(<FinishScreen name="Layla" total={1200} rank={3} />);
    expect(screen.getByText("You're #3 on the leaderboard")).toBeInTheDocument();
  });

  it('hides the rank line when the player has no score yet', () => {
    render(<FinishScreen name="Layla" total={0} rank={null} />);
    expect(screen.queryByText(/on the leaderboard/)).not.toBeInTheDocument();
  });

  it('no longer links to the sign-up form', () => {
    render(<FinishScreen name="Layla" total={1200} rank={3} />);
    expect(screen.queryByText(/Join GDSC/)).not.toBeInTheDocument();
    expect(document.querySelectorAll('a[href*="forms.gle"]')).toHaveLength(0);
  });

  it('links to the leaderboard', () => {
    render(<FinishScreen name="Layla" total={1200} rank={3} />);
    expect(screen.getByRole('link', { name: /view leaderboard/i })).toHaveAttribute('href', '/leaderboard');
  });

  it('describes the event and the hourly prizes', () => {
    render(<FinishScreen name="Layla" total={1200} rank={3} />);
    expect(screen.getByText(/Beirut Arab University, Tripoli campus/)).toBeInTheDocument();
    expect(screen.getByText(/Prizes are given every hour/)).toBeInTheDocument();
    expect(screen.getByText(/top 3/)).toBeInTheDocument();
  });

  it('plays the finish sound once on mount', () => {
    render(<FinishScreen name="Layla" total={1200} rank={3} />);
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(feedback).toHaveBeenCalledWith('finish');
  });
});
