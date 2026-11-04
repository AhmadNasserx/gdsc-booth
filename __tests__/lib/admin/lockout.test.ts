/**
 * @jest-environment node
 */
import {
  clearFailures,
  FAILURE_WINDOW_MS,
  LOCKOUT_MS,
  lockedUntil,
  MAX_FAILURES,
  recordFailure,
} from '@/lib/admin/lockout';
import { clock, installClock, readPath, resetDb } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

const START = 1_700_000_000_000;

beforeEach(() => {
  resetDb();
  clock.now = START;
  installClock();
});

async function fail(times: number): Promise<void> {
  for (let i = 0; i < times; i++) await recordFailure(clock.now);
}

describe('lockout after repeated failures', () => {
  it('lets four failures through and locks on the fifth', async () => {
    expect(MAX_FAILURES).toBe(5);
    await fail(4);
    expect(await lockedUntil(clock.now)).toBeNull();

    await fail(1);
    expect(await lockedUntil(clock.now)).toBe(clock.now + LOCKOUT_MS);
  });

  it('keeps failures that fall inside the window adding up', async () => {
    await fail(4);
    clock.now += FAILURE_WINDOW_MS - 1;
    const fifthAt = clock.now;
    await fail(1);
    expect(await lockedUntil(clock.now)).toBe(fifthAt + LOCKOUT_MS);
  });

  it('does not add up failures spread over more than the failure window', async () => {
    await fail(4);
    clock.now += FAILURE_WINDOW_MS;
    await fail(1);
    expect(await lockedUntil(clock.now)).toBeNull();
    expect(readPath('admin-auth/failures')).toMatchObject({ count: 1 });
  });

  it('ends the lock once LOCKOUT_MS has passed', async () => {
    await fail(MAX_FAILURES);
    const until = START + LOCKOUT_MS;

    clock.now = until - 1;
    expect(await lockedUntil(clock.now)).toBe(until);

    clock.now = until;
    expect(await lockedUntil(clock.now)).toBeNull();
  });

  it('does not extend an active lock with further failures', async () => {
    await fail(MAX_FAILURES);
    clock.now += 60 * 1000;
    await fail(3);

    expect(await lockedUntil(clock.now)).toBe(START + LOCKOUT_MS);
    expect(readPath('admin-auth/failures')).toMatchObject({ lockedUntil: START + LOCKOUT_MS });
  });

  it('clearFailures removes the failure state and starts the count again', async () => {
    await fail(3);
    expect(readPath('admin-auth/failures')).not.toBeNull();

    await clearFailures();
    expect(readPath('admin-auth/failures')).toBeNull();

    await fail(4);
    expect(await lockedUntil(clock.now)).toBeNull();
  });
});
