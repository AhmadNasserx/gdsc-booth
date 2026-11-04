/**
 * @jest-environment node
 */
import { GET } from '@/app/api/admin/export/route';
import { signAdminToken } from '@/lib/admin/auth';
import { ROUND_MS } from '@/lib/event';
import { clock, installClock, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.ADMIN_PASSWORD = 'correct horse battery';

const DAY = 24 * ROUND_MS;
const START = 1_700_000_000_000;
const HEADER = 'name,hour,rank,score,phone,school,class,prize given';

beforeEach(() => {
  resetDb();
  clock.now = START + 2 * ROUND_MS + 1000;
  installClock();

  writePath('event/startedAt', START);
  writePath('leaderboard/ahmad', {
    name: 'Ahmad',
    score: 1500,
    games: { riddles: 500, memory: 500, trivia: 500 },
    timestamp: 1,
    finishedAt: START + 1000,
    expiresAt: START + 3 * DAY,
  });
  writePath('leaderboard/sara', {
    name: 'Sara',
    score: 1000,
    games: { riddles: 1000, memory: 0, trivia: 0 },
    timestamp: 1,
    finishedAt: START + 2000,
    expiresAt: START + 3 * DAY,
  });
  writePath('contacts/ahmad', { name: 'Ahmad', phone: '+96170111222', consentAt: START, expiresAt: START + 3 * DAY });
  writePath('contacts/sara', { name: 'Sara', phone: '+96171333444', consentAt: START, expiresAt: START + 3 * DAY });
});

function exportRequest(withCookie = true): Request {
  const headers: Record<string, string> = withCookie
    ? { cookie: `admin_session=${signAdminToken(clock.now)}` }
    : {};
  return new Request('http://localhost/api/admin/export', { headers });
}

describe('GET /api/admin/export', () => {
  it('answers 200 with a CSV attachment named winners.csv', async () => {
    const res = await GET(exportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="winners.csv"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('starts with the byte order mark and the header row', async () => {
    // Response.text() drops a leading byte order mark, so the raw bytes are checked first.
    const bytes = new Uint8Array(await (await GET(exportRequest())).arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(text.charAt(0)).toBe('﻿');
    expect(text.slice(1).split('\r\n')[0]).toBe(HEADER);
  });

  it('includes the winners phone numbers, with the formula prefix', async () => {
    const text = await (await GET(exportRequest())).text();
    expect(text).toContain("Ahmad,1,1,1500,'+96170111222,,,no");
    expect(text).toContain("Sara,1,2,1000,'+96171333444,,,no");
  });

  it('answers 401 without the admin cookie', async () => {
    const res = await GET(exportRequest(false));
    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
