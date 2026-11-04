/**
 * @jest-environment node
 */
import { DELETE, GET, PATCH } from '@/app/api/admin/players/route';
import { signAdminToken } from '@/lib/admin/auth';
import { clock, installClock, readPath, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.ADMIN_PASSWORD = 'correct horse battery';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const EXPIRES_AT = NOW + 2 * DAY;
const FINISHED_AT = NOW - 60 * 1000;
const ORIGIN = 'http://localhost';
const PLAYERS_URL = 'http://localhost/api/admin/players';
// The digits of the phone number used in these tests, in the forms they could take.
const PHONE_DIGITS = /96170111222|70111222/;

beforeEach(() => {
  resetDb();
  clock.now = NOW;
  installClock();
});

function adminRequest(method: 'GET' | 'PATCH' | 'DELETE', body?: unknown): Request {
  const headers: Record<string, string> = {
    cookie: `admin_session=${signAdminToken(clock.now)}`,
    origin: ORIGIN,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(PLAYERS_URL, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Ahmad, finished, with 1500 points and a live entry. */
function seedAhmad(): void {
  writePath('leaderboard/ahmad', {
    name: 'Ahmad',
    score: 1500,
    games: { riddles: 500, memory: 500, trivia: 500 },
    timestamp: 1,
    finishedAt: FINISHED_AT,
    expiresAt: EXPIRES_AT,
  });
}

function storedAhmad(): Record<string, unknown> {
  return readPath('leaderboard/ahmad') as Record<string, unknown>;
}

describe('PATCH /api/admin/players: game scores', () => {
  it('recomputes the total from the games and keeps expiresAt and finishedAt', async () => {
    seedAhmad();
    const res = await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { riddles: 1000 } }));
    expect(res.status).toBe(200);
    expect((await res.json()).player.score).toBe(2000);

    expect(storedAhmad()).toMatchObject({
      score: 2000,
      games: { riddles: 1000, memory: 500, trivia: 500 },
      expiresAt: EXPIRES_AT,
      finishedAt: FINISHED_AT,
    });
  });

  it('moves the timestamp to now when the total goes up', async () => {
    seedAhmad();
    await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { riddles: 1000 } }));
    expect(storedAhmad().timestamp).toBe(NOW);
  });

  it('keeps the timestamp when the total goes down', async () => {
    seedAhmad();
    await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { riddles: 100 } }));
    expect(storedAhmad()).toMatchObject({ score: 1100, timestamp: 1 });
  });

  it('keeps the timestamp when the total stays the same', async () => {
    seedAhmad();
    await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { riddles: 500 } }));
    expect(storedAhmad()).toMatchObject({ score: 1500, timestamp: 1 });
  });
});

describe('PATCH /api/admin/players: validation', () => {
  it.each([
    ['above 5000', { riddles: 5001 }],
    ['negative', { riddles: -1 }],
    ['fractional', { riddles: 1.5 }],
    ['text', { riddles: 'abc' }],
    ['an unknown game', { chess: 10 }],
    ['an empty games object', {}],
  ])('answers 400 for a score %s and leaves the entry unchanged', async (_label, games) => {
    seedAhmad();
    const before = readPath('leaderboard/ahmad');

    const res = await PATCH(adminRequest('PATCH', { key: 'ahmad', games }));
    expect(res.status).toBe(400);
    expect(readPath('leaderboard/ahmad')).toEqual(before);
  });

  it('answers 404 for a player who is not on the board', async () => {
    const res = await PATCH(adminRequest('PATCH', { key: 'ghost', games: { riddles: 10 } }));
    expect(res.status).toBe(404);
    expect(readPath('leaderboard/ghost')).toBeNull();
  });

  it('answers 404 for a player whose entry has expired', async () => {
    writePath('leaderboard/ahmad', {
      name: 'Ahmad',
      score: 1500,
      games: { riddles: 500, memory: 500, trivia: 500 },
      timestamp: 1,
      expiresAt: NOW - 1,
    });
    const res = await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { riddles: 1000 } }));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/players: finishedAt', () => {
  it('sets finishedAt to now when the third game arrives on an entry without it', async () => {
    writePath('leaderboard/ahmad', {
      name: 'Ahmad',
      score: 1000,
      games: { riddles: 500, memory: 500 },
      timestamp: 1,
      expiresAt: EXPIRES_AT,
    });
    const res = await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { trivia: 300 } }));
    expect(res.status).toBe(200);
    expect(storedAhmad().finishedAt).toBe(NOW);
  });

  it('leaves a player with only two games without finishedAt', async () => {
    writePath('leaderboard/ahmad', {
      name: 'Ahmad',
      score: 1000,
      games: { riddles: 500, memory: 500 },
      timestamp: 1,
      expiresAt: EXPIRES_AT,
    });
    await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { riddles: 600 } }));
    expect(storedAhmad()).not.toHaveProperty('finishedAt');
  });
});

describe('DELETE /api/admin/players', () => {
  beforeEach(() => {
    seedAhmad();
    writePath('names/ahmad', { keyHash: 'h'.repeat(64), claimedAt: NOW, expiresAt: EXPIRES_AT });
    writePath('contacts/ahmad', { name: 'Ahmad', phone: '+96170111222', consentAt: NOW, expiresAt: EXPIRES_AT });
    writePath('seen/ahmad', { riddles: NOW });
    writePath('phones/96170111222', { keyHash: 'h'.repeat(64), normKey: 'ahmad', claimedAt: NOW, expiresAt: EXPIRES_AT });
    writePath('phones/96171333444', { keyHash: 'k'.repeat(64), normKey: 'sara', claimedAt: NOW, expiresAt: EXPIRES_AT });
  });

  it('removes the player from every store and reports what it removed without digits', async () => {
    const res = await DELETE(adminRequest('DELETE', { key: 'ahmad' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ok: true, removed: ['leaderboard', 'name', 'contact', 'seen', 'phone'] });
    for (const label of body.removed as string[]) expect(label).not.toMatch(/\d/);
    expect(JSON.stringify(body)).not.toMatch(PHONE_DIGITS);

    expect(readPath('leaderboard/ahmad')).toBeNull();
    expect(readPath('names/ahmad')).toBeNull();
    expect(readPath('contacts/ahmad')).toBeNull();
    expect(readPath('seen/ahmad')).toBeNull();
    expect(readPath('phones/96170111222')).toBeNull();
  });

  it('keeps the phone claims of other players', async () => {
    await DELETE(adminRequest('DELETE', { key: 'ahmad' }));
    expect(readPath('phones/96171333444')).not.toBeNull();
  });

  it('answers 404 on a second delete', async () => {
    await DELETE(adminRequest('DELETE', { key: 'ahmad' }));
    const res = await DELETE(adminRequest('DELETE', { key: 'ahmad' }));
    expect(res.status).toBe(404);
  });

  it.each(['Ahmad Nasser', '../x', 'a/b'])(
    'answers 400 for the key %s on PATCH and DELETE and removes nothing',
    async (key) => {
      const patch = await PATCH(adminRequest('PATCH', { key, games: { riddles: 1 } }));
      expect(patch.status).toBe(400);

      const del = await DELETE(adminRequest('DELETE', { key }));
      expect(del.status).toBe(400);

      expect(readPath('leaderboard/ahmad')).not.toBeNull();
      expect(readPath('names/ahmad')).not.toBeNull();
      expect(readPath('contacts/ahmad')).not.toBeNull();
      expect(readPath('phones/96170111222')).not.toBeNull();
    },
  );
});

describe('admin log for player changes', () => {
  it('logs each edit and delete with only the time, the action and the target', async () => {
    seedAhmad();
    writePath('phones/96170111222', { keyHash: 'h'.repeat(64), normKey: 'ahmad', claimedAt: NOW, expiresAt: EXPIRES_AT });

    await PATCH(adminRequest('PATCH', { key: 'ahmad', games: { riddles: 1000 } }));
    await DELETE(adminRequest('DELETE', { key: 'ahmad' }));

    const entries = Object.values(readPath('admin-log') as Record<string, Record<string, unknown>>);
    expect(entries).toContainEqual({ at: NOW, action: 'player.edit', target: 'ahmad' });
    expect(entries).toContainEqual({ at: NOW, action: 'player.delete', target: 'ahmad' });
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(['action', 'at', 'target']);
    }
  });
});

describe('GET /api/admin/players', () => {
  it('lists only live players, highest score first', async () => {
    seedAhmad();
    writePath('leaderboard/sara', {
      name: 'Sara',
      score: 2500,
      games: { riddles: 1000, memory: 1000, trivia: 500 },
      timestamp: 5,
      expiresAt: EXPIRES_AT,
    });
    writePath('leaderboard/mid', { name: 'Mid', score: 1000, games: { riddles: 1000 }, timestamp: 3, expiresAt: EXPIRES_AT });
    writePath('leaderboard/old', { name: 'Old', score: 9000, games: { riddles: 3000 }, timestamp: 1, expiresAt: NOW - 1 });

    const body = await (await GET(adminRequest('GET'))).json();
    expect(body.players.map((p: { key: string }) => p.key)).toEqual(['sara', 'ahmad', 'mid']);
    expect(body.players[1]).toMatchObject({ key: 'ahmad', score: 1500, gamesPlayed: 3, finished: true });
  });

  it('never includes a phone number', async () => {
    seedAhmad();
    writePath('contacts/ahmad', { name: 'Ahmad', phone: '+96170111222', consentAt: NOW, expiresAt: EXPIRES_AT });
    writePath('phones/96170111222', { keyHash: 'h'.repeat(64), normKey: 'ahmad', claimedAt: NOW, expiresAt: EXPIRES_AT });

    const text = JSON.stringify(await (await GET(adminRequest('GET'))).json());
    expect(text).not.toMatch(PHONE_DIGITS);
  });
});
