/**
 * @jest-environment node
 */
import { adminDbMock, clock, installClock, resetDb, writePath } from '@/test/support/rtdbMock';

// jest.setup.ts replaces '@/lib/config' for every test. These tests load the real module instead.
jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

const START = 1_700_000_000_000;

function realConfig(): typeof import('@/lib/config') {
  return jest.requireActual<typeof import('@/lib/config')>('@/lib/config');
}

beforeEach(() => {
  resetDb();
  clock.now = START;
  installClock();
  realConfig().clearPauseCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isPaused', () => {
  it('falls back to GAME_PAUSED when no flag is stored', async () => {
    const { isPaused, GAME_PAUSED } = realConfig();
    expect(GAME_PAUSED).toBe(false);
    expect(await isPaused()).toBe(GAME_PAUSED);
  });

  it('is true when config/paused is true', async () => {
    writePath('config/paused', true);
    expect(await realConfig().isPaused()).toBe(true);
  });

  it('is false when config/paused is false', async () => {
    writePath('config/paused', false);
    expect(await realConfig().isPaused()).toBe(false);
  });

  it.each([
    ['a string', 'true'],
    ['a number', 1],
  ])('does not treat %s as paused and falls back to GAME_PAUSED', async (_label, stored) => {
    writePath('config/paused', stored);
    const { isPaused, GAME_PAUSED } = realConfig();
    expect(await isPaused()).toBe(GAME_PAUSED);
  });

  it('reuses a read for 3 seconds, then reads the database again', async () => {
    const { isPaused } = realConfig();
    writePath('config/paused', true);
    expect(await isPaused()).toBe(true);

    writePath('config/paused', false);
    clock.now = START + 2999;
    expect(await isPaused()).toBe(true);

    clock.now = START + 3001;
    expect(await isPaused()).toBe(false);
  });

  it('clearPauseCache forces a fresh read at once', async () => {
    const { isPaused, clearPauseCache } = realConfig();
    writePath('config/paused', true);
    expect(await isPaused()).toBe(true);

    writePath('config/paused', false);
    clearPauseCache();
    expect(await isPaused()).toBe(false);
  });

  it('falls back to GAME_PAUSED when the read throws, and does not cache that answer', async () => {
    const { isPaused, GAME_PAUSED } = realConfig();
    writePath('config/paused', true);
    jest.spyOn(adminDbMock, 'ref').mockImplementationOnce(() => {
      throw new Error('database unavailable');
    });

    expect(await isPaused()).toBe(GAME_PAUSED);
    // The failed read was not cached, so the next call goes to the database and sees the stored true.
    expect(await isPaused()).toBe(true);
  });
});
