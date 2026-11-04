import { nextStreak, STREAK_MIN } from '@/components/games/verdict';

describe('nextStreak', () => {
  it('adds one on a right answer', () => {
    expect(nextStreak(0, true)).toBe(1);
    expect(nextStreak(2, true)).toBe(3);
  });

  it('resets to zero on a wrong answer', () => {
    expect(nextStreak(4, false)).toBe(0);
    expect(nextStreak(0, false)).toBe(0);
  });
});

describe('STREAK_MIN', () => {
  it('is three right answers in a row', () => {
    expect(STREAK_MIN).toBe(3);
  });
});
