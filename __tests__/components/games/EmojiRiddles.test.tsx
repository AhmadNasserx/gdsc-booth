import { render, screen, fireEvent, act } from '@testing-library/react';
import EmojiRiddles from '@/components/games/EmojiRiddles';

// Fix question order so tests are deterministic
jest.mock('@/lib/questions', () => {
  const pool = [
    { emojis: '🕷️ 🌐', hint: 'Scrapes and indexes the web', options: ['Web Crawler', 'Bug Bounty', 'Docker', 'Firewall'], answer: 'Web Crawler' },
    { emojis: '📦 🔄 🚢', hint: 'Containerization platform', options: ['Kubernetes', 'GitLab', 'Docker', 'Linux'], answer: 'Docker' },
    { emojis: '🔑 🔒 📜', hint: 'Encrypts web communication', options: ['SSL/TLS', 'DNS', 'HTTP', 'VPN'], answer: 'SSL/TLS' },
    { emojis: '🐍 💻 ⚡', hint: 'Popular scripting language', options: ['Python', 'C++', 'JavaScript', 'Rust'], answer: 'Python' },
  ];
  return { RIDDLE_POOL: pool, pickRandom: (arr: unknown[], n: number) => arr.slice(0, n) };
});

jest.useFakeTimers();

describe('EmojiRiddles', () => {
  it('renders first question counter', () => {
    render(<EmojiRiddles onComplete={jest.fn()} />);
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });

  it('calls onComplete with 100 when all 4 answers are correct', () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles onComplete={onComplete} />);
    const answers = ['Web Crawler', 'Docker', 'SSL/TLS', 'Python'];
    for (const answer of answers) {
      fireEvent.click(screen.getByText(answer));
      act(() => jest.advanceTimersByTime(1200));
    }
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('calls onComplete with 25 after only the first answer is correct', () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles onComplete={onComplete} />);
    // Correct on Q1
    fireEvent.click(screen.getByText('Web Crawler'));
    act(() => jest.advanceTimersByTime(1200));
    // Wrong on Q2, Q3, Q4
    for (let i = 0; i < 3; i++) {
      const wrongBtn = screen.getAllByRole('button').find(
        (b) => !['Web Crawler', 'Docker', 'SSL/TLS', 'Python'].includes(b.textContent ?? '')
      )!;
      fireEvent.click(wrongBtn);
      act(() => jest.advanceTimersByTime(1200));
    }
    expect(onComplete).toHaveBeenCalledWith(25);
  });

  it('locks buttons after first click on a question', () => {
    render(<EmojiRiddles onComplete={jest.fn()} />);
    fireEvent.click(screen.getByText('Web Crawler'));
    // Clicking again while locked should not navigate away
    fireEvent.click(screen.getByText('Bug Bounty'));
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });
});
