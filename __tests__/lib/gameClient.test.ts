import { GameApiError, fetchMe, sendAction, startGame } from '@/lib/gameClient';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('startGame', () => {
  it('posts the token and game to /api/game/start and returns the start response', async () => {
    const start = { runId: 'run-1', view: { game: 'wordle' } };
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, start));

    await expect(startGame('tok', 'wordle')).resolves.toEqual(start);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/game/start');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ token: 'tok', game: 'wordle' });
  });

  it('throws the server error message with its status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(401, { error: 'Session expired' }));

    const error = await startGame('tok', 'memory').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GameApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as GameApiError).status).toBe(401);
    expect((error as Error).message).toBe('Session expired');
  });

  it('throws a generic message when the error body is not JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });

    await expect(startGame('tok', 'bugs')).rejects.toThrow(/something went wrong/i);
  });

  it('throws a friendly network message when the request never arrives', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await startGame('tok', 'bugs').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GameApiError);
    expect((error as GameApiError).status).toBe(0);
    expect((error as Error).message).toMatch(/check your connection/i);
  });
});

describe('sendAction', () => {
  it('sends the token and run id together with the action body', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { correct: true, done: false }));

    const response = await sendAction<{ correct: boolean }>('tok', 'run-9', { answer: 'Docker' });

    expect(response).toEqual({ correct: true, done: false });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/game/action');
    expect(JSON.parse(init.body)).toEqual({ token: 'tok', runId: 'run-9', answer: 'Docker' });
  });

  it('sends numeric and flip bodies unchanged', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));

    await sendAction('tok', 'run-9', { answer: 2 });
    await sendAction('tok', 'run-9', { flip: 7 });

    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ token: 'tok', runId: 'run-9', answer: 2 });
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body)).toEqual({ token: 'tok', runId: 'run-9', flip: 7 });
  });

  it('rejects with the status and message when the server refuses the action', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(429, { error: 'Too fast' }));

    const error = await sendAction('tok', 'run-9', { guess: 'CRANE' }).catch((e: unknown) => e);

    expect((error as GameApiError).status).toBe(429);
    expect((error as Error).message).toBe('Too fast');
  });

  it('rejects when a successful response has no JSON body', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => null });

    await expect(sendAction('tok', 'run-9', { finish: true })).rejects.toThrow(/something went wrong/i);
  });
});

describe('fetchMe', () => {
  it('posts the token to /api/me and returns the scores', async () => {
    const me = { name: 'Ahmad', total: 1200, rank: 2, bests: { wordle: 700 } };
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, me));

    await expect(fetchMe('tok')).resolves.toEqual(me);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/me');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ token: 'tok' });
  });

  it('throws on an expired session', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(401, { error: 'Session expired' }));
    const error = await fetchMe('tok').catch((e: unknown) => e);
    expect((error as GameApiError).status).toBe(401);
  });
});
