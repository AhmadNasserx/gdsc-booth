import { render, screen } from '@testing-library/react';
import SuccessScreen from '@/components/SuccessScreen';

describe('SuccessScreen', () => {
  it('shows the name, the game, the score out of 1000 and the rank', () => {
    render(<SuccessScreen name="Ahmad" total={640} rank={3} game="memory" />);
    expect(screen.getByText('Well done, Ahmad!')).toBeInTheDocument();
    expect(screen.getByText('Memory Match')).toBeInTheDocument();
    expect(screen.getByText('640')).toBeInTheDocument();
    expect(screen.getByText('/ 1000 pts')).toBeInTheDocument();
    expect(screen.getByText('You are #3 on the leaderboard!')).toBeInTheDocument();
  });

  it('shows the game emoji, hidden from assistive tech', () => {
    const { container } = render(<SuccessScreen name="Ahmad" total={100} rank={1} game="bugs" />);
    expect(container).toHaveTextContent('🐞 Bug Hunter');
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('keeps the Join GDSC and leaderboard links', () => {
    render(<SuccessScreen name="Ahmad" total={100} rank={1} game="riddles" />);
    expect(screen.getByRole('link', { name: /join gdsc/i })).toHaveAttribute(
      'href',
      'https://forms.gle/N5UBuhErH9wqjpV87',
    );
    expect(screen.getByRole('link', { name: /view live leaderboard/i })).toHaveAttribute('href', '/leaderboard');
  });
});
