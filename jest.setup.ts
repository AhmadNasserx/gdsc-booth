import '@testing-library/jest-dom';

// The game is paused in production; tests run it unpaused unless they flip the flag themselves.
jest.mock('@/lib/config', () => ({
  GAME_PAUSED: false,
  PAUSED_MESSAGE: 'The game is paused right now. The leaderboard is still live.',
}));
