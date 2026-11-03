/**
 * @jest-environment node
 */
import { POST } from '@/app/api/session/route';
import { hashPlayerKey } from '@/lib/names';
import { verifySession } from '@/lib/session';
import { readPath, resetDb, writePath } from '@/test/support/rtdbMock';

jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: jest.requireActual('@/test/support/rtdbMock').adminDbMock,
}));

process.env.SESSION_SECRET = 'a'.repeat(64);

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const PHONE_A = '+961 70 111 222';
const PHONE_B = '+961 71 333 444';
const DAY_MS = 172800000;
// The digits of PHONE_A and PHONE_B in any form. Narrow on purpose: random hex or token text must not match.
const PHONE_DIGITS = /96170111222|70111222|\+96170111222|111 222|96171333444|71333444/;

beforeEach(() => {
  resetDb();
});

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Each test player gets their own phone number unless one is passed in. */
function phoneFor(playerKey: unknown): string {
  return playerKey === KEY_B ? PHONE_B : PHONE_A;
}

function claim(name: string, playerKey: unknown = KEY_A, phone: unknown = phoneFor(playerKey), consent: unknown = true) {
  return POST(makeRequest({ name, phone, consent, playerKey }));
}

describe('POST /api/session: response', () => {
  it('returns only a token, with no questions or answers', async () => {
    const res = await claim('Ahmad');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Object.keys(data)).toEqual(['token']);
    expect(typeof data.token).toBe('string');
  });

  it('puts the trimmed name into the token', async () => {
    const data = await (await claim('  Ahmad  ')).json();
    expect(verifySession(data.token)?.name).toBe('Ahmad');
  });

  it('each new session gets a new token and session id', async () => {
    const first = await (await claim('Ahmad')).json();
    const second = await (await claim('Ahmad')).json();
    expect(first.token).not.toBe(second.token);
    expect(verifySession(first.token)?.sessionId).not.toBe(verifySession(second.token)?.sessionId);
  });

  it('keeps the phone number out of the token', async () => {
    const data = await (await claim('Ahmad')).json();
    expect(JSON.stringify(verifySession(data.token))).not.toMatch(PHONE_DIGITS);
  });
});

describe('POST /api/session: name validation', () => {
  it('returns 400 for empty name', async () => {
    expect((await claim('')).status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeRequest({ phone: PHONE_A, consent: true, playerKey: KEY_A }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for name over 30 chars', async () => {
    expect((await claim('A'.repeat(31))).status).toBe(400);
  });

  it('returns 400 for name with HTML special characters', async () => {
    expect((await claim('<script>xss</script>')).status).toBe(400);
  });

  it('returns 400 for a name that normalizes to nothing', async () => {
    const res = await claim('ÀÀ');
    expect(res.status).toBe(400);
    expect(readPath('names')).toBeNull();
  });
});

describe('POST /api/session: player key', () => {
  it('returns 400 "Invalid player key" when playerKey is missing', async () => {
    const res = await POST(makeRequest({ name: 'Ahmad', phone: PHONE_A, consent: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid player key' });
  });

  it.each([
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['uppercase hex', 'A'.repeat(64)],
    ['non-hex characters', 'g'.repeat(64)],
    ['a number', 12345],
    ['null', null],
    ['an empty string', ''],
  ])('returns 400 "Invalid player key" for %s', async (_label, playerKey) => {
    const res = await claim('Ahmad', playerKey);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid player key' });
    expect(readPath('names/ahmad')).toBeNull();
    expect(readPath('phones')).toBeNull();
  });

  it('stores only the hash of the player key', async () => {
    await claim('Ahmad');
    const entry = readPath('names/ahmad') as Record<string, unknown>;
    expect(entry).toMatchObject({
      keyHash: hashPlayerKey(KEY_A),
      claimedAt: expect.any(Number),
      expiresAt: expect.any(Number),
    });
    expect(JSON.stringify(entry)).not.toContain(KEY_A);
    expect(JSON.stringify(readPath('phones'))).not.toContain(KEY_A);
  });

  it('sets the claim to expire two days from now', async () => {
    const before = Date.now();
    await claim('Ahmad');
    const entry = readPath('names/ahmad') as { expiresAt: number };
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(entry.expiresAt).toBeLessThanOrEqual(Date.now() + DAY_MS);
  });

  it('lets the same key reclaim its own unexpired name and refreshes expiresAt', async () => {
    const soon = Date.now() + 1000;
    writePath('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: soon });

    const before = Date.now();
    const res = await claim('Ahmad', KEY_A);
    expect(res.status).toBe(200);
    expect((await res.json()).token).toEqual(expect.any(String));
    const entry = readPath('names/ahmad') as { expiresAt: number; claimedAt: number };
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(entry.claimedAt).toBeGreaterThanOrEqual(before);
  });

  it('refuses a different key for an unexpired name with 409 field name and keeps the original claim', async () => {
    await claim('Ahmad', KEY_A);
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Display name already taken. Choose another.', field: 'name' });
    expect(readPath('names/ahmad')).toMatchObject({ keyHash: hashPlayerKey(KEY_A) });
  });

  it('treats names that normalize to the same key as the same name', async () => {
    await claim('Ahmad Nasser', KEY_A);
    const res = await claim('ahmad   NASSER', KEY_B);
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('name');
  });

  it('refuses a different key for an unexpired legacy claim without a keyHash', async () => {
    writePath('names/ahmad', { claimedAt: 1, expiresAt: Date.now() + DAY_MS });
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('name');
  });

  it('lets another key take a name once its claim has expired', async () => {
    writePath('names/ahmad', { keyHash: hashPlayerKey(KEY_A), claimedAt: 1, expiresAt: Date.now() - 1 });
    const res = await claim('Ahmad', KEY_B);
    expect(res.status).toBe(200);
    expect(readPath('names/ahmad')).toMatchObject({ keyHash: hashPlayerKey(KEY_B) });
  });
});

describe('POST /api/session: phone number', () => {
  it.each([
    ['missing', undefined],
    ['a number', 96170111222],
    ['an empty string', ''],
    ['only symbols', '()-'],
    ['too few digits', '1234567'],
    ['too many digits', '+1234567890123456'],
    ['letters', 'ring me maybe'],
    ['a plus sign after the first character', '961+70111222'],
    ['a zero straight after the plus', '+0961701112'],
  ])('returns 400 with field phone for %s, and claims nothing', async (_label, phone) => {
    const res = await POST(makeRequest({ name: 'Ahmad', playerKey: KEY_A, consent: true, phone }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.field).toBe('phone');
    expect(data.error).toEqual(expect.any(String));
    expect(readPath('names/ahmad')).toBeNull();
    expect(readPath('phones')).toBeNull();
    expect(readPath('contacts')).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['false', false],
    ['a string', 'yes'],
    ['the number 1', 1],
  ])('returns 400 with field consent when consent is %s, and claims nothing', async (_label, consent) => {
    const res = await POST(makeRequest({ name: 'Ahmad', playerKey: KEY_A, phone: PHONE_A, consent }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Agree to be contacted on this number to continue.',
      field: 'consent',
    });
    expect(readPath('names/ahmad')).toBeNull();
    expect(readPath('phones')).toBeNull();
  });

  it.each([
    ['+961 70 111 222', '+96170111222', '96170111222'],
    ['(+961) 70-111-222', '+96170111222', '96170111222'],
    ['0096170111222', '+96170111222', '96170111222'],
    ['00 961 70 111 222', '+96170111222', '96170111222'],
    ['70 111 222', '70111222', '70111222'],
    ['03-111-222', '03111222', '03111222'],
  ])('normalises %s to %s and keys the phone claim by its digits %s', async (input, phone, key) => {
    const res = await claim('Ahmad', KEY_A, input);
    expect(res.status).toBe(200);
    expect(readPath('contacts/ahmad')).toMatchObject({ phone });
    expect(readPath(`phones/${key}`)).toMatchObject({ keyHash: hashPlayerKey(KEY_A) });
  });

  it('stores the phone claim with the hash, the name key and the expiry, and nothing else', async () => {
    const before = Date.now();
    await claim('Ahmad', KEY_A, PHONE_A);
    const entry = readPath('phones/96170111222') as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(['claimedAt', 'expiresAt', 'keyHash', 'normKey']);
    expect(entry).toMatchObject({ keyHash: hashPlayerKey(KEY_A), normKey: 'ahmad' });
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(entry.expiresAt).toBeLessThanOrEqual(Date.now() + DAY_MS);
  });

  it('stores the contact for the organisers under the name key, with the consent time and a 48 hour expiry', async () => {
    const before = Date.now();
    await claim('  Ahmad  ', KEY_A, PHONE_A);
    const contact = readPath('contacts/ahmad') as Record<string, unknown>;
    expect(contact).toEqual({
      name: 'Ahmad',
      phone: '+96170111222',
      consentAt: expect.any(Number),
      expiresAt: expect.any(Number),
    });
    expect(contact.consentAt as number).toBeGreaterThanOrEqual(before);
    expect(contact.expiresAt as number).toBeGreaterThanOrEqual(before + DAY_MS);
    expect(contact.expiresAt as number).toBeLessThanOrEqual(Date.now() + DAY_MS);
  });

  it('refuses a phone number another player holds with 409 field phone, and does not claim the name', async () => {
    await claim('Ahmad', KEY_A, PHONE_A);
    const res = await claim('Bilal', KEY_B, PHONE_A);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'This phone number is already registered.', field: 'phone' });
    expect(readPath('names/bilal')).toBeNull();
    expect(readPath('phones/96170111222')).toMatchObject({ keyHash: hashPlayerKey(KEY_A), normKey: 'ahmad' });
  });

  it('treats different spellings of the same number as the same phone', async () => {
    await claim('Ahmad', KEY_A, '+961 70 111 222');
    const res = await claim('Bilal', KEY_B, '0096170111222');
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('phone');
  });

  it('lets the same player reuse their phone for the same name and for another name', async () => {
    expect((await claim('Ahmad', KEY_A, PHONE_A)).status).toBe(200);
    expect((await claim('Ahmad', KEY_A, PHONE_A)).status).toBe(200);
    expect((await claim('Sara', KEY_A, PHONE_A)).status).toBe(200);
    expect(readPath('phones/96170111222')).toMatchObject({ keyHash: hashPlayerKey(KEY_A) });
  });

  it('lets another player take a phone number once its claim has expired', async () => {
    writePath('phones/96170111222', {
      keyHash: hashPlayerKey(KEY_A),
      normKey: 'ahmad',
      claimedAt: 1,
      expiresAt: Date.now() - 1,
    });
    const res = await claim('Bilal', KEY_B, PHONE_A);
    expect(res.status).toBe(200);
    expect(readPath('phones/96170111222')).toMatchObject({ keyHash: hashPlayerKey(KEY_B), normKey: 'bilal' });
  });

  it('releases the phone claim when the name is taken and this request made that claim', async () => {
    await claim('Ahmad', KEY_A, PHONE_A);
    const res = await claim('Ahmad', KEY_B, PHONE_B);
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('name');
    expect(readPath('phones/96170111222')).toMatchObject({ keyHash: hashPlayerKey(KEY_A) });
    expect(readPath('phones/96171333444')).toBeNull();
  });

  it('keeps a phone claim the player already held when the name is taken', async () => {
    await claim('Ahmad', KEY_B, PHONE_B);
    expect((await claim('Sara', KEY_A, PHONE_A)).status).toBe(200);

    const res = await claim('Ahmad', KEY_A, PHONE_A);
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe('name');
    expect(readPath('phones/96170111222')).toMatchObject({ keyHash: hashPlayerKey(KEY_A) });
  });

  it('does not overwrite the contact record of a name that is taken', async () => {
    await claim('Ahmad', KEY_A, PHONE_A);
    await claim('Ahmad', KEY_B, PHONE_B);
    expect(readPath('contacts/ahmad')).toMatchObject({ phone: '+96170111222' });
  });

  it('never returns or stores the phone number outside the phone and contact records', async () => {
    const ok = await claim('Ahmad', KEY_A, PHONE_A);
    const refusedPhone = await claim('Bilal', KEY_B, PHONE_A);
    const refusedName = await claim('Ahmad', KEY_B, PHONE_B);
    const invalid = await POST(makeRequest({ name: 'Cara', playerKey: KEY_B, consent: true, phone: '+961 70 111 222 999 000' }));

    for (const res of [ok, refusedPhone, refusedName, invalid]) {
      const text = await res.text();
      expect(text).not.toMatch(PHONE_DIGITS);
    }

    expect(readPath('leaderboard')).toBeNull();
    expect(JSON.stringify(readPath('names'))).not.toMatch(PHONE_DIGITS);
  });
});
