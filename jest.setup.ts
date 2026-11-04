import '@testing-library/jest-dom';

// The game is unpaused in tests unless a test sets isPaused itself. The real lib/config is not
// loaded here, because it would import firebase-admin in every test.
jest.mock('@/lib/config', () => ({
  GAME_PAUSED: false,
  PAUSED_MESSAGE: 'The game is paused right now. The leaderboard is still live.',
  isPaused: jest.fn(async () => false),
  clearPauseCache: jest.fn(),
}));
