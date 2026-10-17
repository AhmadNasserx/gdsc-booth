/**
 * @jest-environment node
 */
import { POST as startPOST } from '@/app/api/game/start/route';
import { POST as actionPOST } from '@/app/api/game/action/route';
import { POST as mePOST } from '@/app/api/me/route';
import { RIDDLE_POOL } from '@/lib/questions';
import { signSession } from '@/lib/session';
import { clock, installClock, readPath, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);

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

async function playRiddles(token: string): Promise<number> {
  const started = await (await post(startPOST, { token, game: 'riddles' })).json();
  const { indices } = (readPath(`runs/${started.runId}`) as { state: { indices: number[] } }).state;
  clock.now += 3000;
  const answers = indices.map((i) => RIDDLE_POOL[i].answer);
  const res = await post(actionPOST, { token, runId: started.runId, answers });
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
    const score = await playRiddles(token);

    const me = await (await post(mePOST, { token })).json();
    expect(me).toEqual({ name: 'Ahmad', total: score, rank: 2, bests: { riddles: score } });
  });

  it('cannot raise the total by playing a game again', async () => {
    const { token } = signSession('Ahmad');
    const first = await playRiddles(token);
    clock.now += 1000;
    const again = await post(startPOST, { token, game: 'riddles' });
    expect(again.status).toBe(409);
    const me = await (await post(mePOST, { token })).json();
    expect(me.total).toBe(first);
    expect(me.bests).toEqual({ riddles: first });
  });

  it('shows zero once the leaderboard entry has expired', async () => {
    const { token } = signSession('Ahmad');
    await playRiddles(token);
    writePath('leaderboard/ahmad', { ...(readPath('leaderboard/ahmad') as object), expiresAt: clock.now - 1 });
    const me = await (await post(mePOST, { token })).json();
    expect(me).toEqual({ name: 'Ahmad', total: 0, rank: null, bests: {} });
  });

  it('reads the entry for the name in the token, normalised the same way as the claim', async () => {
    const { token } = signSession('Ahmad Nasser');
    const score = await playRiddles(token);
    const me = await (await post(mePOST, { token })).json();
    expect(me).toMatchObject({ name: 'Ahmad Nasser', total: score });
    expect(readPath('leaderboard/ahmad_nasser')).not.toBeNull();
  });
});
