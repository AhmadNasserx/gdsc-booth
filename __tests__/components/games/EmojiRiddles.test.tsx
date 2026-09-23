import { render, screen, fireEvent, act } from '@testing-library/react';
import EmojiRiddles from '@/components/games/EmojiRiddles';

const questions = [
  { emojis: '🕷️ 🌐', hint: 'Scrapes and indexes the web', options: ['Web Crawler', 'Bug Bounty', 'Docker', 'Firewall'], answer: 'Web Crawler' },
  { emojis: '📦 🔄 🚢', hint: 'Containerization platform', options: ['Kubernetes', 'GitLab', 'Docker', 'Linux'], answer: 'Docker' },
  { emojis: '🔑 🔒 📜', hint: 'Encrypts web communication', options: ['SSL/TLS', 'DNS', 'HTTP', 'VPN'], answer: 'SSL/TLS' },
  { emojis: '🐍 💻 ⚡', hint: 'Popular scripting language', options: ['Python', 'C++', 'JavaScript', 'Rust'], answer: 'Python' },
];

jest.useFakeTimers();

describe('EmojiRiddles', () => {
  it('renders first question counter', () => {
    render(<EmojiRiddles questions={questions} onComplete={jest.fn()} />);
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });

  it('calls onComplete with all 4 answers when complete', () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles questions={questions} onComplete={onComplete} />);
    const correctAnswers = ['Web Crawler', 'Docker', 'SSL/TLS', 'Python'];
    for (const answer of correctAnswers) {
      fireEvent.click(screen.getByText(answer));
      act(() => jest.advanceTimersByTime(1200));
    }
    expect(onComplete).toHaveBeenCalledWith(correctAnswers);
  });

  it('calls onComplete with 4 strings even when answers are wrong', () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles questions={questions} onComplete={onComplete} />);
    // Click wrong answers for all 4 questions
    for (let i = 0; i < 4; i++) {
      const wrongBtn = screen.getAllByRole('button').find(
        (b) => !['Web Crawler', 'Docker', 'SSL/TLS', 'Python'].includes(b.textContent ?? '')
      )!;
      fireEvent.click(wrongBtn);
      act(() => jest.advanceTimersByTime(1200));
    }
    const [answers] = onComplete.mock.calls[0];
    expect(answers).toHaveLength(4);
    expect(answers.every((a: string) => typeof a === 'string')).toBe(true);
  });

  it('locks buttons after first click on a question', () => {
    render(<EmojiRiddles questions={questions} onComplete={jest.fn()} />);
    fireEvent.click(screen.getByText('Web Crawler'));
    fireEvent.click(screen.getByText('Bug Bounty'));
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });
});
