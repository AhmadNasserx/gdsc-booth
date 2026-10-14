/* eslint-disable @typescript-eslint/no-require-imports */
import type * as ClientSession from '@/lib/clientSession';

const HEX_KEY = /^[0-9a-f]{64}$/;

// The module keeps an in-memory fallback key, so each test loads a fresh copy.
function loadModule(): typeof ClientSession {
  let mod: typeof ClientSession | undefined;
  jest.isolateModules(() => {
    mod = require('@/lib/clientSession');
  });
  return mod as typeof ClientSession;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  global.fetch = jest.fn();
});

describe('getPlayerKey', () => {
  it('generates a 64-character hex key and persists it in localStorage', () => {
    const { getPlayerKey } = loadModule();
    const key = getPlayerKey();
    expect(key).toMatch(HEX_KEY);
    expect(localStorage.getItem('gdscPlayerKey')).toBe(key);
  });

  it('returns the same key on later calls and across module reloads', () => {
    const first = loadModule().getPlayerKey();
    expect(loadModule().getPlayerKey()).toBe(first);
    expect(loadModule().getPlayerKey()).toBe(first);
  });

  it('replaces a stored value that is not a valid key', () => {
    localStorage.setItem('gdscPlayerKey', 'not-a-key');
    const key = loadModule().getPlayerKey();
    expect(key).toMatch(HEX_KEY);
    expect(localStorage.getItem('gdscPlayerKey')).toBe(key);
  });

  it('falls back to a stable in-memory key when localStorage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { getPlayerKey } = loadModule();
    const key = getPlayerKey();
    expect(key).toMatch(HEX_KEY);
    expect(getPlayerKey()).toBe(key);
  });
});

describe('saved name', () => {
  it('returns null when nothing is saved', () => {
    expect(loadModule().getSavedName()).toBeNull();
  });

  it('saves and reads back the name', () => {
    const { saveName, getSavedName } = loadModule();
    saveName('Ahmad');
    expect(getSavedName()).toBe('Ahmad');
    expect(localStorage.getItem('gdscPlayerName')).toBe('Ahmad');
  });

  it('does not throw when localStorage is unavailable', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { saveName, getSavedName } = loadModule();
    expect(() => saveName('Ahmad')).not.toThrow();
    expect(getSavedName()).toBeNull();
  });
});

describe('startSession', () => {
  it('posts the trimmed name and a valid player key to /api/session', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { token: 'tok', questions: { riddles: [] } }),
    );
    await loadModule().startSession('  Ahmad  ');

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/session');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.name).toBe('Ahmad');
    expect(body.playerKey).toMatch(HEX_KEY);
    expect(body.playerKey).toBe(localStorage.getItem('gdscPlayerKey'));
  });

  it('stores the session, drops the previous pick, and saves the name on success', async () => {
    sessionStorage.setItem('playerGame', 'bugs');
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { token: 'new-token', questions: { wordleWord: 'CRANE' } }),
    );

    const result = await loadModule().startSession('Ahmad');

    expect(result).toEqual({ ok: true });
    expect(sessionStorage.getItem('playerGame')).toBeNull();
    expect(sessionStorage.getItem('playerToken')).toBe('new-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
    expect(JSON.parse(sessionStorage.getItem('playerQuestions') as string)).toEqual({ wordleWord: 'CRANE' });
    expect(localStorage.getItem('gdscPlayerName')).toBe('Ahmad');
  });

  it('returns the server error and status without touching storage', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(409, { error: 'Display name already taken. Choose another.' }),
    );

    const result = await loadModule().startSession('Ahmad');

    expect(result).toEqual({ ok: false, status: 409, error: 'Display name already taken. Choose another.' });
    expect(sessionStorage.getItem('playerToken')).toBeNull();
    expect(localStorage.getItem('gdscPlayerName')).toBeNull();
  });

  it('uses a generic error when the server error has no message', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(500, {}));
    const result = await loadModule().startSession('Ahmad');
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(result.ok === false && result.error).toMatch(/something went wrong/i);
  });

  it('returns an error instead of throwing when the network request fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await loadModule().startSession('Ahmad');
    expect(result.ok).toBe(false);
  });

  it('returns an error when sessionStorage is unavailable', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { token: 'tok', questions: {} }),
    );
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const result = await loadModule().startSession('Ahmad');
    expect(result.ok).toBe(false);
  });

  it('notifies listeners after a successful start, and not after a failed one', async () => {
    const mod = loadModule();
    const listener = jest.fn();
    const unsubscribe = mod.onSessionStarted(listener);

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(409, { error: 'taken' }));
    await mod.startSession('Ahmad');
    expect(listener).not.toHaveBeenCalled();

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { token: 't', questions: {} }));
    await mod.startSession('Ahmad');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { token: 't', questions: {} }));
    await mod.startSession('Ahmad');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
