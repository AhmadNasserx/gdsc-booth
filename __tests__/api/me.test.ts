/**
 * @jest-environment node
 */
import { POST as startPOST } from '@/app/api/game/start/route';
import { POST as actionPOST } from '@/app/api/game/action/route';
import { POST as mePOST } from '@/app/api/me/route';
import { signSession } from '@/lib/session';
import { clock, installClock, readPath, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);

const PASSWORD = 'XkP9#mRv2!LqT7@wNbZcQdEf';
const DAY_MS = 48 * 60 * 60 * 1000;

beforeEach(() => {
  resetDb();
  installClock();
});

function post(handler: (r: Request) => Promise<Response>, body: unknown) {
  return handler(
    new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function playPassword(token: string): Promise<number> {
  const started = await (await post(startPOST, { token, game: 'password' })).json();
  clock.now += 400;
  const res = await post(actionPOST, { token, runId: started.runId, password: PASSWORD });
  return (await res.json()).result.score as number;
}

describe('POST /api/me', () => {
  it('returns 401 for an invalid token', async () => {
    const res = await post(mePOST, { token: 'nope' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid or expired session' });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await mePOST(new Request('http://localhost/api/me', { method: 'POST', body: '{' }));
    expect(res.status).toBe(400);
  });

  it('returns zero, no rank and no bests for a player who has not scored', async () => {
    const { token } = signSession('Ahmad');
    const res = await post(mePOST, { token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ahmad', total: 0, rank: null, bests: {} });
  });

  it('returns the bests, the total and the rank after a game', async () => {
    writePath('leaderboard/bob', { name: 'Bob', score: 9000, games: { memory: 9000 }, timestamp: 1, expiresAt: clock.now + DAY_MS });
    const { token } = signSession('Ahmad');
    const score = await playPassword(token);

    const me = await (await post(mePOST, { token })).json();
    expect(me).toEqual({ name: 'Ahmad', total: score, rank: 2, bests: { password: score } });
  });

  it('sums the best of each game, not every run', async () => {
    const { token } = signSession('Ahmad');
    const first = await playPassword(token);
    clock.now += 1000;
    const second = await playPassword(token);
    expect(second).toBe(first);
    const me = await (await post(mePOST, { token })).json();
    expect(me.total).toBe(first);
    expect(me.bests).toEqual({ password: first });
  });

  it('shows zero once the leaderboard entry has expired', async () => {
    const { token } = signSession('Ahmad');
    await playPassword(token);
    writePath('leaderboard/ahmad', { ...(readPath('leaderboard/ahmad') as object), expiresAt: clock.now - 1 });
    const me = await (await post(mePOST, { token })).json();
    expect(me).toEqual({ name: 'Ahmad', total: 0, rank: null, bests: {} });
  });

  it('reads the entry for the name in the token, normalised the same way as the claim', async () => {
    const { token } = signSession('Ahmad Nasser');
    const score = await playPassword(token);
    const me = await (await post(mePOST, { token })).json();
    expect(me).toMatchObject({ name: 'Ahmad Nasser', total: score });
    expect(readPath('leaderboard/ahmad_nasser')).not.toBeNull();
  });
});
