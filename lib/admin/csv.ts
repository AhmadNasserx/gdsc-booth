import type { WinnerRound } from './winners';

/**
 * One CSV cell. Text that a spreadsheet could read as a formula gets a leading single quote, and
 * text with a comma, quote or line break is wrapped in quotes with inner quotes doubled.
 */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** The winners of every round as CSV, with a byte order mark so Excel reads accented names correctly. */
export function winnersCsv(rounds: WinnerRound[]): string {
  const header = ['name', 'hour', 'rank', 'score', 'phone', 'prize given'].map(csvCell).join(',');
  const body: string[] = [];
  for (const round of rounds) {
    for (const winner of round.winners) {
      const cells = [
        winner.name,
        round.round,
        winner.rank,
        winner.score,
        winner.phone ?? '',
        winner.prizeGiven ? 'yes' : 'no',
      ];
      body.push(cells.map(csvCell).join(','));
    }
  }
  return `﻿${[header, ...body].join('\r\n')}\r\n`;
}
