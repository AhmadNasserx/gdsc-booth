/**
 * @jest-environment node
 */
import { POST as sessionPOST } from '@/app/api/session/route';
import { POST as startPOST } from '@/app/api/game/start/route';
import { POST as actionPOST } from '@/app/api/game/action/route';
import { GET as leaderboardGET } from '@/app/api/leaderboard/route';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: { ref: () => ({ get: async () => ({ val: () => null }) }) },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('@/lib/config') as { GAME_PAUSED: boolean };

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
  config.GAME_PAUSED = true;
});

afterAll(() => {
  config.GAME_PAUSED = false;
});

describe('paused game', () => {
  it.each([
    ['session', sessionPOST, { name: 'Ahmad', playerKey: 'a'.repeat(64) }],
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
    expect(await res.json()).toEqual([]);
  });
});
