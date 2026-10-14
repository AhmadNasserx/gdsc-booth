import { render, screen, fireEvent, within } from '@testing-library/react';
import TabBar from '@/components/TabBar';
import type { Tab } from '@/lib/types';

describe('TabBar', () => {
  it('renders all six games', () => {
    render(<TabBar activeTab="riddles" chosenTab={null} completedTabs={new Set()} onTabChange={jest.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Games' });
    expect(within(nav).getAllByRole('button')).toHaveLength(6);
    for (const label of ['Riddles', 'Trivia', 'Password', 'Wordle', 'Memory', 'Bugs']) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(/binary/i)).not.toBeInTheDocument();
  });

  it('is horizontally scrollable with snapping and tap targets of at least 44px', () => {
    render(<TabBar activeTab="riddles" chosenTab={null} completedTabs={new Set()} onTabChange={jest.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Games' });
    expect(nav).toHaveClass('overflow-x-auto', 'snap-x');
    for (const button of within(nav).getAllByRole('button')) {
      expect(button).toHaveClass('min-h-11', 'shrink-0', 'whitespace-nowrap');
    }
  });

  it('calls onTabChange with the tab that was tapped', () => {
    const onTabChange = jest.fn();
    render(<TabBar activeTab="riddles" chosenTab={null} completedTabs={new Set()} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Trivia'));
    expect(onTabChange).toHaveBeenCalledWith('trivia');
  });

  it('marks the chosen game with a star and labels it as the scored game', () => {
    render(<TabBar activeTab="riddles" chosenTab="wordle" completedTabs={new Set()} onTabChange={jest.fn()} />);
    const chosen = screen.getByRole('button', { name: /tech wordle \(your scored game\)/i });
    expect(chosen).toHaveTextContent('⭐');
    expect(screen.getAllByText('⭐')).toHaveLength(1);
  });

  it('shows a checkmark only for completed tabs', () => {
    render(
      <TabBar
        activeTab="riddles"
        chosenTab="riddles"
        completedTabs={new Set<Tab>(['riddles'])}
        onTabChange={jest.fn()}
      />,
    );
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('highlights the active tab', () => {
    render(<TabBar activeTab="bugs" chosenTab={null} completedTabs={new Set()} onTabChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /bugs/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /riddles/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
