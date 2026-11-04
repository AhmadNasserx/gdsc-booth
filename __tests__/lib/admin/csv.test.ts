/**
 * @jest-environment node
 */
import { csvCell, winnersCsv } from '@/lib/admin/csv';
import type { WinnerRound, WinnerRow } from '@/lib/admin/winners';

function winner(overrides: Partial<WinnerRow> = {}): WinnerRow {
  return {
    rank: 1,
    name: 'Ann',
    normKey: 'ann',
    score: 900,
    phone: null,
    school: null,
    level: null,
    prizeGiven: false,
    prizeGivenAt: null,
    ...overrides,
  };
}

function round(overrides: Partial<WinnerRound> = {}): WinnerRound {
  return { round: 1, start: 0, end: 3_600_000, current: false, winners: [], ...overrides };
}

describe('csvCell', () => {
  it('returns plain text unchanged', () => {
    expect(csvCell('Ahmad')).toBe('Ahmad');
    expect(csvCell('3-4')).toBe('3-4');
  });

  it('wraps a cell with a comma in quotes', () => {
    expect(csvCell('Nasser, Ahmad')).toBe('"Nasser, Ahmad"');
  });

  it('wraps a cell with a double quote in quotes and doubles the quote', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps a cell with a newline or carriage return in quotes', () => {
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });

  it.each([
    ['=', '=1+1', "'=1+1"],
    ['+', '+96170123456', "'+96170123456"],
    ['-', '-5', "'-5"],
    ['@', '@SUM(A1)', "'@SUM(A1)"],
    ['tab', '\tcmd', "'\tcmd"],
  ])('prefixes a leading %s with a single quote', (_label, input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('prefixes and wraps a leading carriage return', () => {
    expect(csvCell('\rx')).toBe('"\'\rx"');
  });

  it('prefixes and then wraps a formula that also has a comma and quotes', () => {
    expect(csvCell('=HYPERLINK("x", "y")')).toBe('"\'=HYPERLINK(""x"", ""y"")"');
  });

  it('returns numbers as strings with no prefix', () => {
    expect(csvCell(42)).toBe('42');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(-5)).toBe('-5');
  });

  it('returns booleans as strings', () => {
    expect(csvCell(true)).toBe('true');
  });

  it('returns an empty string for null', () => {
    expect(csvCell(null)).toBe('');
  });
});

describe('winnersCsv', () => {
  const HEADER = 'name,hour,rank,score,phone,school,class,prize given';

  it('starts with the UTF-8 byte order mark', () => {
    expect(winnersCsv([]).charAt(0)).toBe('﻿');
  });

  it('writes the header row first', () => {
    const lines = winnersCsv([round({ winners: [winner()] })]).slice(1).split('\r\n');
    expect(lines[0]).toBe(HEADER);
  });

  it('writes only the header when there are no winners', () => {
    expect(winnersCsv([])).toBe(`﻿${HEADER}\r\n`);
  });

  it('uses CRLF line endings throughout', () => {
    const text = winnersCsv([round({ winners: [winner(), winner({ rank: 2, name: 'Bob' })] })]);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('escapes a winner whose name is a formula', () => {
    const text = winnersCsv([round({ winners: [winner({ name: '=HYPERLINK("x")' })] })]);
    const row = text.split('\r\n')[1];
    expect(row).toBe('"\'=HYPERLINK(""x"")",1,1,900,,,,no');
  });

  it('leaves the phone cell empty when there is no phone', () => {
    const row = winnersCsv([round({ winners: [winner({ phone: null })] })]).split('\r\n')[1];
    expect(row.split(',')[4]).toBe('');
  });

  it('writes the phone, with the formula prefix, when there is one', () => {
    const row = winnersCsv([round({ winners: [winner({ phone: '+96170123456' })] })]).split('\r\n')[1];
    expect(row).toBe("Ann,1,1,900,'+96170123456,,,no");
  });

  it('writes the school and class after the phone', () => {
    const row = winnersCsv([round({ winners: [winner({ school: 'Collège des Frères', level: 'Grade 12 · LS / SV' })] })]).split('\r\n')[1];
    expect(row).toBe('Ann,1,1,900,,Collège des Frères,Grade 12 · LS / SV,no');
  });

  it('writes yes for a prize given and no otherwise', () => {
    const text = winnersCsv([
      round({
        winners: [
          winner({ prizeGiven: true, prizeGivenAt: 1 }),
          winner({ rank: 2, name: 'Bob', prizeGiven: false }),
        ],
      }),
    ]);
    const [, first, second] = text.split('\r\n');
    expect(first.endsWith(',yes')).toBe(true);
    expect(second.endsWith(',no')).toBe(true);
  });

  it('lists the rounds in order, with the hour number', () => {
    const text = winnersCsv([
      round({ round: 1, winners: [winner({ name: 'Ann' })] }),
      round({ round: 2, winners: [winner({ name: 'Bob', rank: 1, score: 700 })] }),
    ]);
    const rows = text.split('\r\n').slice(1, 3);
    expect(rows).toEqual(['Ann,1,1,900,,,,no', 'Bob,2,1,700,,,,no']);
  });
});
