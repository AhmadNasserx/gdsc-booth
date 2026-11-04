import { adminDb } from '../firebaseAdmin';

export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 10 * 60 * 1000;
export const LOCKOUT_MS = 5 * 60 * 1000;

const PATH = 'admin-auth/failures';

interface FailureState {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

const EMPTY: FailureState = { count: 0, windowStart: 0, lockedUntil: 0 };

function isState(value: unknown): value is FailureState {
  return !!value && typeof value === 'object';
}

/** The time the lockout ends, or null when logins are open. The counter is global on purpose. */
export async function lockedUntil(now: number): Promise<number | null> {
  const snap = await adminDb.ref(PATH).get();
  const state: unknown = snap.val();
  if (!isState(state)) return null;
  if (typeof state.lockedUntil === 'number' && state.lockedUntil > now) return state.lockedUntil;
  return null;
}

/** Counts one failed login. The fifth failure inside the window starts a lockout. */
export async function recordFailure(now: number): Promise<void> {
  await adminDb.ref(PATH).transaction((current: unknown) => {
    const state: FailureState = isState(current) ? (current as FailureState) : EMPTY;
    if (state.lockedUntil > now) return state;

    const fresh = state.count === 0 || now - state.windowStart >= FAILURE_WINDOW_MS;
    let next: FailureState = fresh
      ? { count: 1, windowStart: now, lockedUntil: 0 }
      : { count: state.count + 1, windowStart: state.windowStart, lockedUntil: 0 };
    if (next.count >= MAX_FAILURES) next = { count: 0, windowStart: 0, lockedUntil: now + LOCKOUT_MS };
    return next;
  });
}

/** Clears the failure counter after a successful login. */
export async function clearFailures(): Promise<void> {
  await adminDb.ref(PATH).remove();
}
