/**
 * @jest-environment node
 */
import { GET } from '@/app/api/status/route';
import { isPaused, PAUSED_MESSAGE } from '@/lib/config';

beforeEach(() => {
  (isPaused as jest.Mock).mockReset();
});

describe('GET /api/status', () => {
  it('reports not paused with no message', async () => {
    (isPaused as jest.Mock).mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ paused: false });
    expect(body).not.toHaveProperty('message');
  });

  it('reports paused with the paused message', async () => {
    (isPaused as jest.Mock).mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paused: true, message: PAUSED_MESSAGE });
  });

  it('is marked no-store', async () => {
    (isPaused as jest.Mock).mockResolvedValue(false);
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers 500 with a generic error when the pause check fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (isPaused as jest.Mock).mockRejectedValue(new Error('database unavailable'));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server error. Try again.' });
    consoleError.mockRestore();
  });
});
