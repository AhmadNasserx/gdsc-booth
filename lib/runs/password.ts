import type { PasswordResponse } from '../apiTypes';
import { calcPasswordScore, passwordPerformance } from '../scoring';
import { RunError, type Step } from './shared';

/** Longer input is refused. Strength stops rising well before this anyway. */
export const PASSWORD_MAX_LENGTH = 256;

export interface PasswordState {
  submitted: boolean;
}

export interface PasswordAction {
  password: string;
}

export type PasswordStepResponse = Omit<PasswordResponse, 'done' | 'result'>;

export function startPassword(): { state: PasswordState; view: { game: 'password' } } {
  return { state: { submitted: false }, view: { game: 'password' } };
}

export function hydratePassword(raw: Partial<PasswordState> | null | undefined): PasswordState {
  return { submitted: raw?.submitted === true };
}

export function parsePasswordAction(body: Record<string, unknown>): PasswordAction {
  if (typeof body.password !== 'string') throw new RunError(400, 'password must be a string');
  if (body.password.length > PASSWORD_MAX_LENGTH) {
    throw new RunError(400, `password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
  return { password: body.password };
}

/** The password is the only action and always finishes the run. */
export function applyPassword(state: PasswordState, action: PasswordAction): Step<PasswordState, PasswordStepResponse> {
  if (state.submitted) throw new RunError(409, 'This game is already finished');
  return {
    state: { submitted: true },
    response: { score: calcPasswordScore(action.password) },
    performance: passwordPerformance(action.password),
  };
}
