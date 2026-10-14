/**
 * @jest-environment node
 */
import { applyPassword, parsePasswordAction, PASSWORD_MAX_LENGTH, startPassword } from '@/lib/runs/password';
import { calcPasswordScore } from '@/lib/scoring';
import { RunError } from '@/lib/runs/shared';

describe('startPassword', () => {
  it('has no content to hide', () => {
    expect(startPassword().view).toEqual({ game: 'password' });
  });
});

describe('parsePasswordAction', () => {
  it('requires a string', () => {
    expect(() => parsePasswordAction({ password: 12 })).toThrow(RunError);
    expect(() => parsePasswordAction({})).toThrow(RunError);
  });

  it('refuses input longer than the limit', () => {
    expect(() => parsePasswordAction({ password: 'a'.repeat(PASSWORD_MAX_LENGTH + 1) })).toThrow(RunError);
    expect(parsePasswordAction({ password: 'a'.repeat(PASSWORD_MAX_LENGTH) })).toEqual({ password: 'a'.repeat(PASSWORD_MAX_LENGTH) });
  });
});

describe('applyPassword', () => {
  const strong = 'XkP9#mRv2!LqT7@wNbZcQdEf';

  it('finishes at once with performance from the strength and reports the strength score', () => {
    const step = applyPassword({ submitted: false }, { password: strong });
    expect(step.performance).toBe(1);
    expect(step.response).toEqual({ score: calcPasswordScore(strong) });
    expect(step.state.submitted).toBe(true);
  });

  it('gives zero performance for an empty password', () => {
    expect(applyPassword({ submitted: false }, { password: '' }).performance).toBe(0);
  });

  it('refuses a second submission', () => {
    expect(() => applyPassword({ submitted: true }, { password: strong })).toThrow(RunError);
  });
});
