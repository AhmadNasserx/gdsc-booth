import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';
import { adminDb } from '@/lib/firebaseAdmin';
import { isPaused, PAUSED_MESSAGE } from '@/lib/config';
import { NAME_PATTERN, normalizeName, hashPlayerKey, isValidPlayerKey } from '@/lib/names';
import { normalizePhone } from '@/lib/phone';
import { ensureEventStarted } from '@/lib/event';
import { readProfile } from '@/lib/profile';

const NAME_TTL_MS = 172800000;

interface NameEntry {
  keyHash: string;
  claimedAt: number;
  expiresAt: number;
}

interface PhoneEntry {
  keyHash: string;
  normKey: string;
  claimedAt: number;
  expiresAt: number;
}

export async function POST(request: Request) {
  if (await isPaused()) return NextResponse.json({ error: PAUSED_MESSAGE }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fields = (body ?? {}) as Record<string, unknown>;

  const raw = fields.name;
  if (typeof raw !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const name = raw.trim();
  const normKey = normalizeName(name);
  // A name made only of characters that normalize away (e.g. "ÀÀ") would address the whole names/ node
  if (!name || !NAME_PATTERN.test(name) || !normKey) {
    return NextResponse.json(
      { error: 'Name must be 2–30 characters: letters, numbers, and spaces only.' },
      { status: 400 },
    );
  }

  const playerKey = fields.playerKey;
  if (!isValidPlayerKey(playerKey)) {
    return NextResponse.json({ error: 'Invalid player key' }, { status: 400 });
  }

  if (typeof fields.phone !== 'string') {
    return NextResponse.json({ error: 'Phone number is required.', field: 'phone' }, { status: 400 });
  }
  const phone = normalizePhone(fields.phone);
  if (!phone.ok) {
    return NextResponse.json({ error: phone.error, field: 'phone' }, { status: 400 });
  }

  if (fields.consent !== true) {
    return NextResponse.json(
      { error: 'Agree to be contacted on this number to continue.', field: 'consent' },
      { status: 400 },
    );
  }

  // School, class and language. Checked before anything is claimed, so a refusal leaves nothing behind.
  const profile = readProfile(fields);
  if (!profile.ok) {
    return NextResponse.json({ error: profile.error, field: profile.field }, { status: 400 });
  }

  const now = Date.now();
  const keyHash = hashPlayerKey(playerKey);

  // Claim the phone number first. Only the hash of the player key is stored, and the phone
  // itself is kept just for the organisers in contacts/. The claim is refused for an unexpired
  // claim by a different player; the same player may reclaim it.
  const phoneState = { created: false };
  const phoneClaim = await adminDb.ref(`phones/${phone.key}`).transaction((current) => {
    const entry = current as PhoneEntry | null;
    if (entry && entry.expiresAt > now && entry.keyHash !== keyHash) return; // held by another player
    phoneState.created = !(entry && entry.expiresAt > now && entry.keyHash === keyHash);
    const next: PhoneEntry = { keyHash, normKey, claimedAt: now, expiresAt: now + NAME_TTL_MS };
    return next;
  });
  if (!phoneClaim.committed) {
    return NextResponse.json(
      { error: 'This phone number is already registered.', field: 'phone' },
      { status: 409 },
    );
  }

  // Claim the name for this player key. Only the hash is stored.
  // Unexpired claims by a different key are refused; the same key may reclaim its own name.
  const { committed } = await adminDb.ref(`names/${normKey}`).transaction((current) => {
    const entry = current as NameEntry | null;
    if (entry && entry.expiresAt > now && entry.keyHash !== keyHash) return; // held by another player
    const next: NameEntry = { keyHash, claimedAt: now, expiresAt: now + NAME_TTL_MS };
    return next;
  });
  if (!committed) {
    // Undo the phone claim only if this request made it, so a retry from the same player keeps its own.
    if (phoneState.created) await releasePhone(phone.key, keyHash, normKey);
    return NextResponse.json(
      { error: 'Display name already taken. Choose another.', field: 'name' },
      { status: 409 },
    );
  }

  // The prize clock starts with the first player. It is set once and never moved.
  await ensureEventStarted(now);

  // The organisers' copy of the contact. It is never returned to a client or written to the leaderboard.
  await adminDb.ref(`contacts/${normKey}`).set({
    name,
    phone: phone.phone,
    consentAt: now,
    school: profile.profile.school,
    schoolListed: profile.profile.schoolListed,
    grade: profile.profile.grade,
    track: profile.profile.track,
    lang: profile.profile.lang,
    expiresAt: now + NAME_TTL_MS,
  });

  const { token } = signSession(name);
  return NextResponse.json({ token });
}

/** Removes a phone claim made by this request, provided it still belongs to this player and name. */
async function releasePhone(key: string, keyHash: string, normKey: string): Promise<void> {
  await adminDb.ref(`phones/${key}`).transaction((current) => {
    const entry = current as PhoneEntry | null;
    if (entry && entry.keyHash === keyHash && entry.normKey === normKey) return null;
    return undefined;
  });
}
