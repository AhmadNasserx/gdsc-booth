import { render, screen, fireEvent } from '@testing-library/react';
import TabBar from '@/components/TabBar';
import type { Tab } from '@/lib/types';

describe('TabBar', () => {
  const tabs: Tab[] = ['riddles', 'trivia', 'binary', 'password', 'wordle'];

  it('renders all 5 tabs', () => {
    render(<TabBar activeTab="riddles" completedTabs={new Set()} onTabChange={jest.fn()} />);
    expect(screen.getByText(/emoji/i)).toBeInTheDocument();
    expect(screen.getByText(/trivia/i)).toBeInTheDocument();
    expect(screen.getByText(/binary/i)).toBeInTheDocument();
    expect(screen.getByText(/pass/i)).toBeInTheDocument();
    expect(screen.getByText(/wordle/i)).toBeInTheDocument();
  });

  it('calls onTabChange with correct tab', () => {
    const onTabChange = jest.fn();
    render(<TabBar activeTab="riddles" completedTabs={new Set()} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText(/trivia/i));
    expect(onTabChange).toHaveBeenCalledWith('trivia');
  });

  it('shows checkmark for completed tabs', () => {
    render(<TabBar activeTab="riddles" completedTabs={new Set<Tab>(['trivia'])} onTabChange={jest.fn()} />);
    expect(screen.getByText(/✓/)).toBeInTheDocument();
  });
});
