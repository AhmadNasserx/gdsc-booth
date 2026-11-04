import { render, screen, within } from '@testing-library/react';
import RoundBoard, { formatCountdown } from '@/components/RoundBoard';
import type { RoundResult } from '@/lib/apiTypes';

// Local-time dates, so the HH:MM text is the same in every timezone.
const at = (hour: number, minute = 0) => new Date(2026, 10, 4, hour, minute).getTime();
const HOUR = 60 * 60 * 1000;

function round(n: number, top: RoundResult['top']): RoundResult {
  const start = at(12 + n - 1);
  return { round: n, start, end: start + HOUR, top };
}

describe('RoundBoard', () => {
  it("shows the current hour's top 3 with medals, names and points", () => {
    const rounds = [
      round(2, [
        { name: 'Sara', score: 1500, rank: 1 },
        { name: 'Ali', score: 1200, rank: 2 },
        { name: 'Ahmad', score: 900, rank: 3 },
      ]),
    ];
    render(<RoundBoard rounds={rounds} currentRound={2} />);
    expect(screen.getByText("This hour's top 3")).toBeInTheDocument();
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('🥈')).toBeInTheDocument();
    expect(screen.getByText('🥉')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.getByText('1500 pts')).toBeInTheDocument();
    expect(screen.getByText('Ali')).toBeInTheDocument();
    expect(screen.getByText('1200 pts')).toBeInTheDocument();
    expect(screen.getByText('Ahmad')).toBeInTheDocument();
    expect(screen.getByText('900 pts')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for a finisher')).not.toBeInTheDocument();
  });

  it('shows the hour window in local time as HH:MM–HH:MM', () => {
    const rounds = [round(2, [{ name: 'Sara', score: 10, rank: 1 }])];
    render(<RoundBoard rounds={rounds} currentRound={2} />);
    expect(screen.getByText('Hour 2 · 13:00–14:00')).toBeInTheDocument();
  });

  it('shows a waiting line for each rank with no finisher yet', () => {
    const rounds = [round(1, [{ name: 'Sara', score: 10, rank: 1 }])];
    render(<RoundBoard rounds={rounds} currentRound={1} />);
    expect(screen.getAllByText('Waiting for a finisher')).toHaveLength(2);
  });

  it('says no one has finished yet when the current hour has no top at all', () => {
    render(<RoundBoard rounds={[]} currentRound={3} />);
    expect(screen.getByText('No one has finished all three games this hour yet')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for a finisher')).not.toBeInTheDocument();
  });

  it('asks for the first player when there is no current hour', () => {
    render(<RoundBoard rounds={[]} currentRound={null} />);
    expect(screen.getByText('The first player starts the prize clock')).toBeInTheDocument();
    expect(screen.getByText('No earlier hours yet')).toBeInTheDocument();
  });

  it('lists completed hours latest first, and leaves out the current hour', () => {
    const rounds = [
      round(1, [{ name: 'First', score: 100, rank: 1 }]),
      round(3, [{ name: 'Current', score: 300, rank: 1 }]),
      round(2, [{ name: 'Second', score: 200, rank: 1 }]),
    ];
    render(<RoundBoard rounds={rounds} currentRound={3} />);
    const headings = screen
      .getAllByText(/^Hour \d · /)
      .map((el) => el.textContent);
    expect(headings).toEqual([
      'Hour 3 · 14:00–15:00',
      'Hour 2 · 13:00–14:00',
      'Hour 1 · 12:00–13:00',
    ]);
    const earlier = screen.getByText('Earlier hours').closest('section')!;
    expect(within(earlier).getByText('Second')).toBeInTheDocument();
    expect(within(earlier).getByText('First')).toBeInTheDocument();
    expect(within(earlier).queryByText('Current')).not.toBeInTheDocument();
  });

  it('shows "No finishers this hour" for a completed hour with no finishers', () => {
    const rounds = [
      round(1, []),
      round(2, [{ name: 'Sara', score: 50, rank: 1 }]),
    ];
    render(<RoundBoard rounds={rounds} currentRound={2} />);
    expect(screen.getByText('No finishers this hour')).toBeInTheDocument();
    expect(screen.getByText('Hour 1 · 12:00–13:00')).toBeInTheDocument();
  });

  it('shows "No earlier hours yet" while only the current hour exists', () => {
    const rounds = [round(1, [{ name: 'Sara', score: 50, rank: 1 }])];
    render(<RoundBoard rounds={rounds} currentRound={1} />);
    expect(screen.getByText('No earlier hours yet')).toBeInTheDocument();
  });

  it('never shows a phone number', () => {
    const rounds = [round(1, [{ name: 'Sara', score: 50, rank: 1 }])];
    const { container } = render(<RoundBoard rounds={rounds} currentRound={2} />);
    expect(container.textContent ?? '').not.toMatch(/\+?\d{7,}/);
  });
});

describe('formatCountdown', () => {
  it('shows zero as 00:00', () => {
    expect(formatCountdown(0)).toBe('00:00');
  });

  it('floors to whole seconds, so 59,999 ms reads as 00:59', () => {
    expect(formatCountdown(59_999)).toBe('00:59');
  });

  it('shows a full hour as 60:00', () => {
    expect(formatCountdown(3_600_000)).toBe('60:00');
  });

  it('treats a negative time as 00:00', () => {
    expect(formatCountdown(-5_000)).toBe('00:00');
  });

  it('zero-pads minutes and seconds', () => {
    expect(formatCountdown(65_000)).toBe('01:05');
  });
});
