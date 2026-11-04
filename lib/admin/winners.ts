import { adminDb } from '../firebaseAdmin';
import type { LeaderboardEntry } from '../types';
import { isLive } from '../runs/ranking';
import { currentRound, readEventStart, roundWindow, topOfRound } from '../event';
import { levelLabel } from '../profile';

export interface Contact {
  name: string;
  phone: string;
  consentAt: number;
  expiresAt: number;
  school?: string;
  grade?: string;
  track?: string | null;
  lang?: string;
}

export interface WinnerRow {
  rank: number;
  name: string;
  normKey: string;
  score: number;
  phone: string | null;
  /** School and class from the home page, or null for a contact saved before they were asked. */
  school: string | null;
  level: string | null;
  prizeGiven: boolean;
  prizeGivenAt: number | null;
}

export interface WinnerRound {
  round: number;
  start: number;
  end: number;
  current: boolean;
  winners: WinnerRow[];
}

export interface PrizeRecord {
  givenAt: number;
}

const KEY_PATTERN = /^[a-z0-9_]{1,30}$/;

/** The top three of every hour from the start up to the current hour, with contacts and prize state. */
export function buildWinnerRounds(input: {
  startedAt: number | null;
  now: number;
  entries: Record<string, LeaderboardEntry>;
  contacts: Record<string, Contact>;
  prizes: Record<string, Record<string, PrizeRecord>>;
}): WinnerRound[] {
  const { startedAt, now } = input;
  if (startedAt === null) return [];

  const live = Object.entries(input.entries).filter(([, entry]) => isLive(entry, now));
  const keyByName = new Map<string, string>(live.map(([key, entry]): [string, string] => [entry.name, key]));
  const liveEntries = live.map(([, entry]) => entry);
  const current = currentRound(startedAt, now) ?? 0;

  const rounds: WinnerRound[] = [];
  for (let n = 1; n <= current; n++) {
    const { start, end } = roundWindow(startedAt, n);
    const top = topOfRound(liveEntries, startedAt, n);
    const roundPrizes: Record<string, PrizeRecord> | undefined = input.prizes[String(n)];
    const winners: WinnerRow[] = [];
    for (const winner of top) {
      const normKey = keyByName.get(winner.name);
      if (normKey === undefined) continue;
      const contact: Contact | undefined = input.contacts[normKey];
      const phone =
        contact && typeof contact.phone === 'string' && typeof contact.expiresAt === 'number' && contact.expiresAt > now
          ? contact.phone
          : null;
      const current = phone !== null ? contact : undefined;
      const school = current && typeof current.school === 'string' ? current.school : null;
      const level = current && typeof current.grade === 'string' ? levelLabel(current.grade, current.track) : null;
      const prize: PrizeRecord | undefined = roundPrizes?.[normKey];
      winners.push({
        rank: winner.rank,
        name: winner.name,
        normKey,
        score: winner.score,
        phone,
        school,
        level,
        prizeGiven: prize !== undefined,
        prizeGivenAt: prize ? prize.givenAt : null,
      });
    }
    rounds.push({ round: n, start, end, current: n === current, winners });
  }
  return rounds;
}

/** Reads the leaderboard, contacts and prizes and builds the winner rounds from them. */
export async function readWinnerRounds(now: number): Promise<{ startedAt: number | null; rounds: WinnerRound[] }> {
  const [entriesSnap, contactsSnap, prizesSnap, event] = await Promise.all([
    adminDb.ref('leaderboard').get(),
    adminDb.ref('contacts').get(),
    adminDb.ref('prizes').get(),
    readEventStart(),
  ]);
  const rounds = buildWinnerRounds({
    startedAt: event.startedAt,
    now,
    entries: (entriesSnap.val() ?? {}) as Record<string, LeaderboardEntry>,
    contacts: (contactsSnap.val() ?? {}) as Record<string, Contact>,
    prizes: (prizesSnap.val() ?? {}) as Record<string, Record<string, PrizeRecord>>,
  });
  return { startedAt: event.startedAt, rounds };
}

/** Marks or clears the prize for a winner of a round that has been reached. */
export async function setPrizeGiven(
  round: number,
  key: string,
  given: boolean,
  now: number,
): Promise<'ok' | 'not-started' | 'round-not-reached' | 'unknown-player'> {
  if (!KEY_PATTERN.test(key)) return 'unknown-player';

  const event = await readEventStart();
  if (event.startedAt === null) return 'not-started';
  const current = currentRound(event.startedAt, now) ?? 0;
  if (!Number.isInteger(round) || round < 1 || round > current) return 'round-not-reached';

  const snap = await adminDb.ref(`leaderboard/${key}`).get();
  const entry = snap.val() as LeaderboardEntry | null;
  if (!isLive(entry, now)) return 'unknown-player';

  const ref = adminDb.ref(`prizes/${round}/${key}`);
  if (given) await ref.set({ givenAt: now });
  else await ref.remove();
  return 'ok';
}
