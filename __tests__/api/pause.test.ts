/**
 * @jest-environment node
 */
import { POST as sessionPOST } from '@/app/api/session/route';
import { POST as startPOST } from '@/app/api/game/start/route';
import { POST as actionPOST } from '@/app/api/game/action/route';
import { GET as leaderboardGET } from '@/app/api/leaderboard/route';
import { isPaused } from '@/lib/config';
import { resetDb } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

function post(handler: (r: Request) => Promise<Response>, body: unknown) {
  return handler(
    new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  resetDb();
  (isPaused as jest.Mock).mockResolvedValue(true);
});

afterAll(() => {
  (isPaused as jest.Mock).mockResolvedValue(false);
});

describe('paused game', () => {
  it.each([
    ['session', sessionPOST, { name: 'Ahmad', phone: '+961 70 123 456', consent: true, playerKey: 'a'.repeat(64) }],
    ['start', startPOST, { token: 'x', game: 'riddles' }],
    ['action', actionPOST, { token: 'x', runId: 'y', answers: [] }],
  ])('%s answers 503 with the paused message', async (_name, handler, body) => {
    const res = await post(handler as (r: Request) => Promise<Response>, body);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: expect.stringMatching(/paused/i) });
  });

  it('keeps the leaderboard working', async () => {
    const res = await leaderboardGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ entries: [], rounds: [] }));
  });
});

describe('game not paused', () => {
  it('lets the start route past the pause check', async () => {
    (isPaused as jest.Mock).mockResolvedValue(false);
    const res = await post(startPOST, { token: 'x', game: 'riddles' });
    // The token is not a valid session, so the route stops at its own check and never answers 503.
    expect(res.status).not.toBe(503);
    expect(res.status).toBe(401);
  });
});
