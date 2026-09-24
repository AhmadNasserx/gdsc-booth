import { render, screen, waitFor } from '@testing-library/react';
import PlayPage from '@/app/play/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
global.fetch = jest.fn();

const mockQuestions = JSON.stringify({
  riddles: [
    { emojis: '🕷️ 🌐', hint: 'Scrapes and indexes the web', options: ['Web Crawler', 'Bug Bounty', 'Docker', 'Firewall'], answer: 'Web Crawler' },
    { emojis: '📦 🔄 🚢', hint: 'Containerization platform', options: ['Kubernetes', 'GitLab', 'Docker', 'Linux'], answer: 'Docker' },
    { emojis: '🔑 🔒 📜', hint: 'Encrypts web communication', options: ['SSL/TLS', 'DNS', 'HTTP', 'VPN'], answer: 'SSL/TLS' },
    { emojis: '🐍 💻 ⚡', hint: 'Snake language', options: ['Python', 'C++', 'JavaScript', 'Rust'], answer: 'Python' },
  ],
  trivia: [
    { question: "What does GDSC stand for?", options: ['Google Developer Student Clubs', 'Other'], answer: 'Google Developer Student Clubs' },
    { question: "CSS stands for?", options: ['Cascading Style Sheets', 'Other'], answer: 'Cascading Style Sheets' },
    { question: "What does API stand for?", options: ['Application Programming Interface', 'Other'], answer: 'Application Programming Interface' },
  ],
  binaryChar: '42',
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe('Play Page', () => {
  it('redirects to / when no session in sessionStorage', async () => {
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('redirects to / when playerQuestions is missing', async () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('renders game hub with TabBar when session and questions exist', () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    sessionStorage.setItem('playerQuestions', mockQuestions);
    render(<PlayPage />);
    expect(screen.getByText(/emoji/i)).toBeInTheDocument();
  });

  it('Submit button is disabled until all 4 games completed', () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    sessionStorage.setItem('playerQuestions', mockQuestions);
    render(<PlayPage />);
    expect(screen.getByRole('button', { name: /submit score/i })).toBeDisabled();
  });
});
