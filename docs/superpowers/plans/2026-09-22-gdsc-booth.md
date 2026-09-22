# GDSC Booth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GDSC Interactive Tech Station — a 4-game booth web app with a secure real-time leaderboard, hosted free on Vercel.

**Architecture:** Next.js 15 App Router on Vercel Hobby. All score writes go through a server-side API route using Firebase Admin SDK (clients never write to Firebase directly). Real-time leaderboard reads via Firebase client SDK. Upstash Redis handles rate limiting. HMAC-signed session tokens prevent cold score injection.

**Tech Stack:** Next.js 15, TypeScript (strict), Tailwind CSS, Firebase 11 (client) + Firebase Admin 12 (server), Upstash Redis + @upstash/ratelimit, Jest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-09-22-gdsc-booth-design.md`

## Global Constraints

- Next.js 15 App Router only; no Pages Router
- TypeScript strict mode throughout
- Tailwind CSS for all styling; arbitrary values allowed (e.g. `text-[#4285F4]`)
- Google brand colors: `#4285F4` blue · `#EA4335` red · `#FBBC04` yellow · `#34A853` green · `#F8F9FA` bg · `#DADCE0` border · `#5F6368` muted · `#202124` text
- All client components must declare `"use client"` at top
- Firebase Admin SDK imported only in API routes — never in client components
- `FIREBASE_PRIVATE_KEY` always processed with `.replace(/\\n/g, '\n')`
- Session tokens: HMAC-SHA256, 30-min TTL, stored in `sessionStorage`
- Every Firebase write includes `expiresAt: Date.now() + 86400000`
- Name inputs: max 30 chars, HTML-stripped server-side
- Consent notice required before session creation; rendered on `/`
- Google Form placeholder URL: `https://forms.gle/PLACEHOLDER`
- `NEXT_PUBLIC_APP_URL` used for CSRF Origin check in `/api/score`

---

## File Map

```
lib/
  types.ts              shared TypeScript interfaces
  session.ts            HMAC sign + verify session tokens
  scoring.ts            score validation + calcPasswordScore
  firebase.ts           Firebase client init (read-only, public config)
  firebaseAdmin.ts      Firebase Admin init (server-only, private key)
  rateLimit.ts          Upstash Redis sliding-window rate limiter

app/
  layout.tsx            root layout, security headers applied via next.config.ts
  globals.css           Tailwind base imports only
  page.tsx              name entry + consent notice → POST /api/session
  play/page.tsx         game hub: tab bar + 4 games + submit
  leaderboard/page.tsx  live leaderboard (second screen)
  api/session/route.ts  POST — issues signed session token
  api/score/route.ts    POST — validates + writes score to Firebase
  api/cron/cleanup/route.ts  GET — deletes expired Firebase entries (daily cron)

components/
  TabBar.tsx
  SuccessScreen.tsx
  LeaderboardTable.tsx
  games/
    EmojiRiddles.tsx
    TechTrivia.tsx
    BinaryDecoder.tsx
    PasswordChallenge.tsx

__tests__/
  lib/session.test.ts
  lib/scoring.test.ts
  api/session.test.ts
  api/score.test.ts
  api/cron/cleanup.test.ts
  components/games/EmojiRiddles.test.tsx
  components/games/TechTrivia.test.tsx
  components/games/BinaryDecoder.test.tsx
  components/games/PasswordChallenge.test.tsx
  components/LeaderboardTable.test.tsx
  app/play/page.test.tsx

next.config.ts          security headers
vercel.json             cron schedule
.env.local.example      all required env vars documented
```

---

### Task 1: Project Scaffold + Configuration

**Files:**
- Create: `package.json` (via scaffolding)
- Create: `next.config.ts`
- Create: `vercel.json`
- Create: `.env.local.example`
- Create: `jest.config.ts`
- Create: `jest.setup.ts`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: running Next.js 15 app at localhost:3000 with Tailwind; Jest wired up

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

- [ ] **Step 2: Install dependencies**

```bash
npm install firebase firebase-admin @upstash/ratelimit @upstash/redis
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest @types/jest
```

- [ ] **Step 3: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com; img-src 'self' data:; style-src 'self' 'unsafe-inline';",
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Write `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/cleanup", "schedule": "0 0 * * *" }
  ]
}
```

- [ ] **Step 5: Write `.env.local.example`**

```bash
# Server-only (no NEXT_PUBLIC_ prefix — never in client bundle)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=        # paste raw from JSON; code applies .replace(/\\n/g, '\n')
SESSION_SECRET=              # random 32-byte hex: openssl rand -hex 32
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=                 # Vercel injects automatically for cron routes

# Public (safe to expose — read-only Firebase client config)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_APP_URL=         # e.g. https://gdsc-booth.vercel.app (no trailing slash)
```

- [ ] **Step 6: Write `jest.config.ts`**

```ts
import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};

export default createJestConfig(config);
```

- [ ] **Step 7: Write `jest.setup.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 8: Write `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GDSC Interactive Tech Station',
  description: 'Google Developer Student Clubs booth app',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#F8F9FA] text-[#202124] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Smoke-test dev server**

```bash
npm run dev
```

Expected: `localhost:3000` loads the default Next.js page with no errors in the terminal.

- [ ] **Step 10: Verify Jest is wired**

```bash
npx jest --passWithNoTests
```

Expected: `Test Suites: 0 passed`

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 15 project with security headers, Jest, and cron config"
```

---

### Task 2: Shared Types + Session Token Library

**Files:**
- Create: `lib/types.ts`
- Create: `lib/session.ts`
- Create: `__tests__/lib/session.test.ts`

**Interfaces:**
- Produces:
  - `signSession(name: string): { token: string; sessionId: string }`
  - `verifySession(token: string): SessionPayload | null`
  - `SessionPayload { sessionId: string; name: string; issuedAt: number }`
  - `Tab = 'riddles' | 'trivia' | 'binary' | 'password'`

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type Tab = 'riddles' | 'trivia' | 'binary' | 'password';

export interface SessionPayload {
  sessionId: string;
  name: string;
  issuedAt: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  timestamp: number;
  expiresAt: number;
}

export interface SubmissionRecord {
  rank: number;
  expiresAt: number;
}
```

- [ ] **Step 2: Write failing tests in `__tests__/lib/session.test.ts`**

```ts
import { signSession, verifySession } from '@/lib/session';

process.env.SESSION_SECRET = 'a'.repeat(64);

describe('signSession', () => {
  it('returns a token string and sessionId', () => {
    const { token, sessionId } = signSession('Ahmad');
    expect(typeof token).toBe('string');
    expect(token).toContain('.');
    expect(typeof sessionId).toBe('string');
  });
});

describe('verifySession', () => {
  it('round-trips a valid token', () => {
    const { token } = signSession('Ahmad');
    const payload = verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload?.name).toBe('Ahmad');
    expect(payload?.sessionId).toBeDefined();
  });

  it('returns null for tampered token', () => {
    const { token } = signSession('Ahmad');
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(verifySession(tampered)).toBeNull();
  });

  it('returns null for expired token', () => {
    const { token } = signSession('Ahmad');
    const [encoded, sig] = token.split('.');
    // Craft a token with issuedAt 31 minutes ago
    const old = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    old.issuedAt = Date.now() - 31 * 60 * 1000;
    // Re-sign the old payload so signature is valid but expired
    const { createHmac } = require('crypto');
    const newEncoded = Buffer.from(JSON.stringify(old)).toString('base64url');
    const newSig = createHmac('sha256', process.env.SESSION_SECRET!)
      .update(newEncoded)
      .digest('base64url');
    expect(verifySession(`${newEncoded}.${newSig}`)).toBeNull();
  });

  it('returns null for malformed token', () => {
    expect(verifySession('notavalidtoken')).toBeNull();
    expect(verifySession('')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests — expect failure**

```bash
npx jest __tests__/lib/session.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/session'`

- [ ] **Step 4: Write `lib/session.ts`**

```ts
import { createHmac, randomUUID } from 'crypto';
import type { SessionPayload } from './types';

const TTL_MS = 30 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env var not set');
  return s;
}

export function signSession(name: string): { token: string; sessionId: string } {
  const sessionId = randomUUID();
  const payload: SessionPayload = { sessionId, name, issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(encoded).digest('base64url');
  return { token: `${encoded}.${sig}`, sessionId };
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;
    const encoded = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', secret()).update(encoded).digest('base64url');
    if (sig !== expected) return null;
    const payload: SessionPayload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );
    if (Date.now() - payload.issuedAt > TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx jest __tests__/lib/session.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/session.ts __tests__/lib/session.test.ts
git commit -m "feat: shared types and HMAC session token library"
```

---

### Task 3: Score Validation Library

**Files:**
- Create: `lib/scoring.ts`
- Create: `__tests__/lib/scoring.test.ts`

**Interfaces:**
- Produces:
  - `validateScores(scores: Record<Tab, number>): boolean`
  - `calcTotal(scores: Record<Tab, number>): number`
  - `calcPasswordScore(pass: string): number`
  - `VALID_RIDDLE_SCORES: Set<number>`
  - `VALID_BINARY_SCORES: Set<number>`

- [ ] **Step 1: Write failing tests in `__tests__/lib/scoring.test.ts`**

```ts
import {
  validateScores,
  calcTotal,
  calcPasswordScore,
  VALID_RIDDLE_SCORES,
  VALID_BINARY_SCORES,
} from '@/lib/scoring';
import type { Tab } from '@/lib/types';

const valid = { riddles: 75, trivia: 50, binary: 100, password: 80 };

describe('validateScores', () => {
  it('accepts valid score set', () => {
    expect(validateScores(valid)).toBe(true);
  });

  it('rejects riddle score not in valid set', () => {
    expect(validateScores({ ...valid, riddles: 10 })).toBe(false);
    expect(validateScores({ ...valid, riddles: 101 })).toBe(false);
    expect(validateScores({ ...valid, riddles: 50.5 })).toBe(false);
  });

  it('rejects trivia score out of [0,99]', () => {
    expect(validateScores({ ...valid, trivia: 100 })).toBe(false);
    expect(validateScores({ ...valid, trivia: -1 })).toBe(false);
    expect(validateScores({ ...valid, trivia: 1.5 })).toBe(false);
  });

  it('rejects binary score not 0 or 100', () => {
    expect(validateScores({ ...valid, binary: 50 })).toBe(false);
    expect(validateScores({ ...valid, binary: 1 })).toBe(false);
  });

  it('rejects password score out of [0,100]', () => {
    expect(validateScores({ ...valid, password: 101 })).toBe(false);
    expect(validateScores({ ...valid, password: -1 })).toBe(false);
  });
});

describe('calcTotal', () => {
  it('sums all four scores', () => {
    expect(calcTotal({ riddles: 100, trivia: 99, binary: 100, password: 100 })).toBe(399);
    expect(calcTotal({ riddles: 0, trivia: 0, binary: 0, password: 0 })).toBe(0);
  });
});

describe('calcPasswordScore', () => {
  it('returns 0 for empty string', () => {
    expect(calcPasswordScore('')).toBe(0);
  });

  it('awards 25 for length >= 8', () => {
    expect(calcPasswordScore('aaaaaaaa')).toBe(25);
  });

  it('awards 50 for length >= 12 (includes length>=8 bonus)', () => {
    expect(calcPasswordScore('aaaaaaaaaaaa')).toBe(50);
  });

  it('awards max 100 for strong password', () => {
    expect(calcPasswordScore('MyP@ssw0rd123!')).toBe(100);
  });

  it('caps at 100', () => {
    expect(calcPasswordScore('Aa0!aaaaaaaaaaaa')).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest __tests__/lib/scoring.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `lib/scoring.ts`**

```ts
import type { Tab } from './types';

export const VALID_RIDDLE_SCORES = new Set([0, 25, 50, 75, 100]);
export const VALID_BINARY_SCORES = new Set([0, 100]);
export const MAX_TRIVIA_SCORE = 99;
export const MAX_PASSWORD_SCORE = 100;
export const MAX_TOTAL = 400;

export function validateScores(scores: Record<Tab, number>): boolean {
  const { riddles, trivia, binary, password } = scores;
  if (!VALID_RIDDLE_SCORES.has(riddles)) return false;
  if (!Number.isInteger(trivia) || trivia < 0 || trivia > MAX_TRIVIA_SCORE) return false;
  if (!VALID_BINARY_SCORES.has(binary)) return false;
  if (!Number.isInteger(password) || password < 0 || password > MAX_PASSWORD_SCORE) return false;
  return true;
}

export function calcTotal(scores: Record<Tab, number>): number {
  return scores.riddles + scores.trivia + scores.binary + scores.password;
}

export function calcPasswordScore(pass: string): number {
  let score = 0;
  if (pass.length >= 8) score += 25;
  if (pass.length >= 12) score += 25;
  if (/[A-Z]/.test(pass)) score += 15;
  if (/[0-9]/.test(pass)) score += 15;
  if (/[^A-Za-z0-9]/.test(pass)) score += 20;
  return Math.min(score, 100);
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/lib/scoring.test.ts
```

Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/scoring.ts __tests__/lib/scoring.test.ts
git commit -m "feat: score validation and password strength library"
```

---

### Task 4: Firebase Client + Admin Libraries

**Files:**
- Create: `lib/firebase.ts`
- Create: `lib/firebaseAdmin.ts`

No unit tests — these are thin wrappers tested implicitly through API route tests.

**Interfaces:**
- Produces:
  - `db: Database` (Firebase Realtime Database client instance, from `lib/firebase.ts`)
  - `adminDb: admin.database.Database` (from `lib/firebaseAdmin.ts`)

- [ ] **Step 1: Write `lib/firebase.ts`**

```ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);
```

- [ ] **Step 2: Write `lib/firebaseAdmin.ts`**

```ts
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

export const adminDb = getDatabase();
```

- [ ] **Step 3: Commit**

```bash
git add lib/firebase.ts lib/firebaseAdmin.ts
git commit -m "feat: Firebase client and Admin SDK wrappers"
```

---

### Task 5: Upstash Rate Limiter

**Files:**
- Create: `lib/rateLimit.ts`

**Interfaces:**
- Produces:
  - `ratelimit: Ratelimit` — sliding window, 1 request per 10 min
  - `hashKey(sessionId: string): string` — SHA-256 hex of sessionId

- [ ] **Step 1: Write `lib/rateLimit.ts`**

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(1, '10 m'),
  prefix: 'gdsc-booth',
});

export function hashKey(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/rateLimit.ts
git commit -m "feat: Upstash Redis rate limiter"
```

---

### Task 6: POST /api/session Route

**Files:**
- Create: `app/api/session/route.ts`
- Create: `__tests__/api/session.test.ts`

**Interfaces:**
- Consumes: `signSession` from `lib/session.ts`
- Produces: `POST /api/session` → `200 { token: string }` | `400 { error: string }`

- [ ] **Step 1: Write failing tests in `__tests__/api/session.test.ts`**

```ts
import { POST } from '@/app/api/session/route';

process.env.SESSION_SECRET = 'a'.repeat(64);

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/session', () => {
  it('returns a token for a valid name', async () => {
    const res = await POST(makeRequest({ name: 'Ahmad' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.token).toBe('string');
  });

  it('returns 400 for empty name', async () => {
    const res = await POST(makeRequest({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing name', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for name over 30 chars', async () => {
    const res = await POST(makeRequest({ name: 'A'.repeat(31) }));
    expect(res.status).toBe(400);
  });

  it('strips HTML from name before signing', async () => {
    const res = await POST(makeRequest({ name: '<script>xss</script>' }));
    // Either 400 (empty after strip) or 200 with no HTML in token
    if (res.status === 200) {
      const { token } = await res.json();
      expect(token).not.toContain('<script>');
    } else {
      expect(res.status).toBe(400);
    }
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest __tests__/api/session.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `app/api/session/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { signSession } from '@/lib/session';

function stripHtml(str: string): string {
  return str.replace(/[<>"'&]/g, '').trim();
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>)?.name;
  if (typeof raw !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const name = stripHtml(raw);
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (name.length > 30) {
    return NextResponse.json({ error: 'name must be 30 characters or fewer' }, { status: 400 });
  }

  const { token } = signSession(name);
  return NextResponse.json({ token });
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/api/session.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/session/route.ts __tests__/api/session.test.ts
git commit -m "feat: POST /api/session — issues signed session tokens"
```

---

### Task 7: POST /api/score Route

**Files:**
- Create: `app/api/score/route.ts`
- Create: `__tests__/api/score.test.ts`

**Interfaces:**
- Consumes: `verifySession`, `validateScores`, `calcTotal`, `ratelimit`, `hashKey`, `adminDb`
- Produces: `POST /api/score` → `200 { rank, total }` | `400/401/403/429 { error }`

- [ ] **Step 1: Write failing tests in `__tests__/api/score.test.ts`**

```ts
import { POST } from '@/app/api/score/route';
import { signSession } from '@/lib/session';

process.env.SESSION_SECRET = 'a'.repeat(64);
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// Mock Upstash
jest.mock('@/lib/rateLimit', () => ({
  ratelimit: { limit: jest.fn().mockResolvedValue({ success: true }) },
  hashKey: (s: string) => s,
}));

// Mock Firebase Admin
const mockPush = jest.fn().mockResolvedValue({ key: 'abc123' });
const mockRef = jest.fn(() => ({ push: mockPush, get: jest.fn().mockResolvedValue({ val: () => null }), set: jest.fn() }));
jest.mock('@/lib/firebaseAdmin', () => ({ adminDb: { ref: mockRef } }));

function makeRequest(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

function validBody(tokenOverride?: string) {
  const { token } = signSession('Ahmad');
  return {
    token: tokenOverride ?? token,
    submissionId: 'sub-123',
    scores: { riddles: 75, trivia: 50, binary: 100, password: 80 },
  };
}

describe('POST /api/score', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with rank and total for valid submission', async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.rank).toBe('number');
    expect(data.total).toBe(305);
  });

  it('returns 403 for wrong origin', async () => {
    const res = await POST(makeRequest(validBody(), 'http://evil.com'));
    expect(res.status).toBe(403);
  });

  it('returns 401 for invalid token', async () => {
    const res = await POST(makeRequest({ ...validBody(), token: 'bad.token' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid score values', async () => {
    const body = { ...validBody(), scores: { riddles: 10, trivia: 50, binary: 100, password: 80 } };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    const { ratelimit } = require('@/lib/rateLimit');
    ratelimit.limit.mockResolvedValueOnce({ success: false });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest __tests__/api/score.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `app/api/score/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';
import { validateScores, calcTotal } from '@/lib/scoring';
import { ratelimit, hashKey } from '@/lib/rateLimit';
import { adminDb } from '@/lib/firebaseAdmin';
import type { Tab } from '@/lib/types';

export async function POST(request: Request) {
  // CSRF: check Origin
  const origin = request.headers.get('origin') ?? '';
  if (origin !== process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Verify session token
  const token = body.token as string;
  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  // Rate limit by sessionId
  const { success } = await ratelimit.limit(hashKey(session.sessionId));
  if (!success) {
    return NextResponse.json({ error: 'Already submitted' }, { status: 429 });
  }

  // Idempotency: check if submissionId already processed
  const submissionId = body.submissionId as string;
  if (!submissionId) {
    return NextResponse.json({ error: 'submissionId required' }, { status: 400 });
  }

  const existingRef = adminDb.ref(`submissions/${submissionId}`);
  const existing = await existingRef.get();
  if (existing.val()) {
    return NextResponse.json(existing.val());
  }

  // Validate scores
  const scores = body.scores as Record<Tab, number>;
  if (!scores || !validateScores(scores)) {
    return NextResponse.json({ error: 'Invalid scores' }, { status: 400 });
  }

  const total = calcTotal(scores);
  const now = Date.now();
  const expiresAt = now + 86400000;
  const name = session.name;

  // Calculate rank
  const leaderboardSnap = await adminDb.ref('leaderboard').get();
  const entries: Record<string, { score: number }> = leaderboardSnap.val() ?? {};
  const rank = Object.values(entries).filter((e) => e.score > total).length + 1;

  // Write to Firebase
  await adminDb.ref('leaderboard').push({ name, score: total, timestamp: now, expiresAt });
  await existingRef.set({ rank, expiresAt });

  return NextResponse.json({ rank, total });
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/api/score.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/score/route.ts __tests__/api/score.test.ts
git commit -m "feat: POST /api/score — validated, rate-limited, idempotent score submission"
```

---

### Task 8: Cleanup Cron Route

**Files:**
- Create: `app/api/cron/cleanup/route.ts`
- Create: `__tests__/api/cron/cleanup.test.ts`

**Interfaces:**
- Produces: `GET /api/cron/cleanup` → `200 { deleted: number }` | `401`

- [ ] **Step 1: Write failing tests in `__tests__/api/cron/cleanup.test.ts`**

```ts
import { GET } from '@/app/api/cron/cleanup/route';

process.env.CRON_SECRET = 'test-cron-secret';

const mockExpired = {
  entry1: { name: 'Old', score: 100, expiresAt: Date.now() - 1000 },
};
const mockFresh = {
  entry2: { name: 'New', score: 200, expiresAt: Date.now() + 86400000 },
};

const mockRemove = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/firebaseAdmin', () => ({
  adminDb: {
    ref: jest.fn((path: string) => ({
      get: jest.fn().mockResolvedValue({
        val: () => (path === 'leaderboard' ? { ...mockExpired, ...mockFresh } : {}),
        forEach: (cb: (snap: { key: string; val: () => unknown }) => void) => {
          const data = path === 'leaderboard' ? { ...mockExpired, ...mockFresh } : {};
          Object.entries(data).forEach(([key, val]) => cb({ key, val: () => val }));
        },
      }),
      child: jest.fn(() => ({ remove: mockRemove })),
    })),
  },
}));

function makeRequest(auth?: string) {
  return new Request('http://localhost/api/cron/cleanup', {
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
}

describe('GET /api/cron/cleanup', () => {
  it('returns 401 without authorization', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong secret', async () => {
    const res = await GET(makeRequest('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('deletes expired entries and returns count', async () => {
    const res = await GET(makeRequest('test-cron-secret'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest __tests__/api/cron/cleanup.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `app/api/cron/cleanup/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  let deleted = 0;

  for (const path of ['leaderboard', 'submissions'] as const) {
    const snap = await adminDb.ref(path).get();
    const data: Record<string, { expiresAt: number }> = snap.val() ?? {};
    for (const [key, entry] of Object.entries(data)) {
      if (entry.expiresAt < now) {
        await adminDb.ref(path).child(key).remove();
        deleted++;
      }
    }
  }

  return NextResponse.json({ deleted });
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/api/cron/cleanup.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/cleanup/route.ts __tests__/api/cron/cleanup.test.ts
git commit -m "feat: daily cron cleanup of expired Firebase entries"
```

---

### Task 9: Name Entry Page

**Files:**
- Create: `app/page.tsx`
- Create: `__tests__/app/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/session`
- Produces: sets `sessionStorage.playerToken` and `sessionStorage.playerName`, navigates to `/play`

- [ ] **Step 1: Write failing tests in `__tests__/app/page.test.tsx`**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

global.fetch = jest.fn();

describe('Name Entry Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders name input and consent notice', () => {
    render(<Page />);
    expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument();
    expect(screen.getByText(/deleted automatically after 24 hours/i)).toBeInTheDocument();
  });

  it('Start button is disabled for empty name', () => {
    render(<Page />);
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('navigates to /play on successful session creation', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'test-token' }),
    });
    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerToken')).toBe('test-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
  });

  it('shows error message when session creation fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    render(<Page />);
    await userEvent.type(screen.getByPlaceholderText(/display name/i), 'Ahmad');
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest __tests__/app/page.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Write `app/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NameEntry() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleStart() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Failed to start session');
      const { token } = await res.json();
      sessionStorage.setItem('playerToken', token);
      sessionStorage.setItem('playerName', name.trim());
      router.push('/play');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#DADCE0] rounded-3xl p-8 shadow-sm">
        {/* GDSC Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-0.5 mb-2">
            {[['G','#4285F4'],['o','#EA4335'],['o','#FBBC04'],['g','#4285F4'],['l','#34A853'],['e','#EA4335']].map(([c,col],i) => (
              <span key={i} className="text-3xl font-bold" style={{ color: col as string }}>{c}</span>
            ))}
            <span className="ml-2 text-xs font-semibold bg-[#E8F0FE] text-[#1A73E8] px-3 py-1 rounded-full">
              Developer Student Clubs
            </span>
          </div>
          <h1 className="text-2xl font-extrabold mt-2">Interactive Tech Station</h1>
          <p className="text-sm text-[#5F6368] mt-1">Test your skills and join GDSC!</p>
        </div>

        <label className="block text-sm font-semibold mb-1 text-[#202124]">
          Choose a display name
        </label>
        <input
          type="text"
          placeholder="Your display name..."
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleStart()}
          className="w-full p-3.5 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm mb-3"
        />

        <p className="text-xs text-[#5F6368] mb-4 bg-[#F8F9FA] rounded-xl p-3 border border-[#DADCE0]">
          Your display name and score will appear on today&apos;s public leaderboard and will be deleted automatically after 24 hours.
        </p>

        {error && (
          <p role="alert" className="text-xs text-[#EA4335] mb-3">{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={!name.trim() || loading}
          className="w-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-full transition-all"
        >
          {loading ? 'Starting…' : 'Start'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/app/page.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx __tests__/app/page.test.tsx
git commit -m "feat: name entry page with consent notice and session creation"
```

---

### Task 10: EmojiRiddles Component

**Files:**
- Create: `components/games/EmojiRiddles.tsx`
- Create: `__tests__/components/games/EmojiRiddles.test.tsx`

**Interfaces:**
- Consumes: `onComplete: (score: number) => void`
- Produces: calls `onComplete` with score in `{0,25,50,75,100}` after all 4 questions

- [ ] **Step 1: Write failing tests in `__tests__/components/games/EmojiRiddles.test.tsx`**

```tsx
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EmojiRiddles from '@/components/games/EmojiRiddles';

jest.useFakeTimers();

describe('EmojiRiddles', () => {
  it('renders first question', () => {
    render(<EmojiRiddles onComplete={jest.fn()} />);
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });

  it('calls onComplete with 25 after one correct answer then skipping rest', async () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles onComplete={onComplete} />);
    // Answer first question correctly (Web Crawler)
    fireEvent.click(screen.getByText('Web Crawler'));
    act(() => jest.advanceTimersByTime(1200));
    // Answer remaining 3 wrong
    for (let i = 0; i < 3; i++) {
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[1]); // wrong option
      act(() => jest.advanceTimersByTime(1200));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(25));
  });

  it('calls onComplete with 100 for all correct answers', async () => {
    const onComplete = jest.fn();
    render(<EmojiRiddles onComplete={onComplete} />);
    const answers = ['Web Crawler', 'Docker', 'SSL/TLS', 'Python'];
    for (const answer of answers) {
      await waitFor(() => screen.getByText(answer));
      fireEvent.click(screen.getByText(answer));
      act(() => jest.advanceTimersByTime(1200));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(100));
  });

  it('locks answer after first click', () => {
    render(<EmojiRiddles onComplete={jest.fn()} />);
    fireEvent.click(screen.getByText('Web Crawler'));
    const buttons = screen.getAllByRole('button');
    // All buttons should now show feedback state (correct/wrong coloring applied)
    // Clicking again should not change state — we verify by checking onComplete not called yet
    fireEvent.click(screen.getByText('Docker')); // wrong, but locked
    // Still on Q1 (1.2s delay not elapsed)
    expect(screen.getByText(/Question 1 of 4/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npx jest __tests__/components/games/EmojiRiddles.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Write `components/games/EmojiRiddles.tsx`**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface Riddle { emojis: string; hint: string; options: string[]; answer: string; }

const RIDDLES: Riddle[] = [
  { emojis: '🕷️ 🌐', hint: 'Scrapes and indexes the web', options: ['Web Crawler','Bug Bounty','Dark Web','Firewall'], answer: 'Web Crawler' },
  { emojis: '📦 🔄 🚢', hint: 'Containerization platform', options: ['Kubernetes','Docker','GitLab','Linux'], answer: 'Docker' },
  { emojis: '🔑 🔒 📜', hint: 'Encrypts communication online', options: ['SSL/TLS','DNS','HTTP','VPN'], answer: 'SSL/TLS' },
  { emojis: '🐍 💻 ⚡', hint: 'Popular programming language', options: ['Python','C++','JavaScript','Rust'], answer: 'Python' },
];

interface Props { onComplete: (score: number) => void; }

export default function EmojiRiddles({ onComplete }: Props) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const completedRef = useRef(false);

  function handleAnswer(opt: string) {
    if (answered) return;
    setAnswered(true);
    setChosen(opt);
    const newScore = opt === RIDDLES[idx].answer ? score + 25 : score;
    if (opt === RIDDLES[idx].answer) setScore(newScore);

    setTimeout(() => {
      if (idx < RIDDLES.length - 1) {
        setIdx((p) => p + 1);
        setAnswered(false);
        setChosen(null);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete(newScore);
      }
    }, 1200);
  }

  const riddle = RIDDLES[idx];

  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-xs font-bold text-[#1A73E8] uppercase tracking-wider bg-[#E8F0FE] px-3 py-1 rounded-full mb-4">
        Question {idx + 1} of {RIDDLES.length}
      </span>
      <div className="text-6xl my-4 tracking-widest">{riddle.emojis}</div>
      <p className="text-sm text-[#5F6368] mb-6 italic">Hint: {riddle.hint}</p>
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {riddle.options.map((opt) => {
          const isCorrect = opt === riddle.answer;
          const isChosen = opt === chosen;
          return (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              className={`p-4 text-sm font-medium rounded-2xl border transition-all ${
                answered
                  ? isCorrect
                    ? 'bg-[#E6F4EA] border-[#34A853] text-[#137333] font-bold'
                    : isChosen
                    ? 'bg-[#FCE8E6] border-[#EA4335] text-[#C5221F]'
                    : 'border-[#DADCE0] text-[#5F6368]'
                  : 'border-[#DADCE0] hover:border-[#1A73E8] hover:bg-[#F8F9FA]'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <p className="text-xs font-semibold text-[#5F6368]">Score: {score}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest __tests__/components/games/EmojiRiddles.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add components/games/EmojiRiddles.tsx __tests__/components/games/EmojiRiddles.test.tsx
git commit -m "feat: EmojiRiddles game component"
```

---

### Task 11: TechTrivia Component

**Files:**
- Create: `components/games/TechTrivia.tsx`
- Create: `__tests__/components/games/TechTrivia.test.tsx`

**Interfaces:**
- Consumes: `onComplete: (score: number) => void`
- Produces: calls `onComplete` with score in `[0, 99]`; time bonus = `Math.floor(remaining / 10 * 8)` per correct answer

- [ ] **Step 1: Write failing tests in `__tests__/components/games/TechTrivia.test.tsx`**

```tsx
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import TechTrivia from '@/components/games/TechTrivia';

jest.useFakeTimers();

describe('TechTrivia', () => {
  it('renders start screen with Start button', () => {
    render(<TechTrivia onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: /start speed trivia/i })).toBeInTheDocument();
  });

  it('shows first question after clicking Start', () => {
    render(<TechTrivia onComplete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start speed trivia/i }));
    expect(screen.getByText(/Question 1\/3/i)).toBeInTheDocument();
    expect(screen.getByText(/10s/i)).toBeInTheDocument();
  });

  it('timer expiry counts as wrong answer', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start speed trivia/i }));
    // Let all 3 questions time out
    for (let i = 0; i < 3; i++) {
      act(() => jest.advanceTimersByTime(11000));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(0));
  });

  it('correct answer at 10s remaining gives 25 + 8 = 33 pts', async () => {
    const onComplete = jest.fn();
    render(<TechTrivia onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /start speed trivia/i }));
    // Answer immediately (timer just started, 10s remaining)
    fireEvent.click(screen.getByText('Google Developer Student Clubs'));
    fireEvent.click(screen.getByText('Flutter'));
    fireEvent.click(screen.getByText('Gemini'));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toBe(99); // 3 * 33
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx jest __tests__/components/games/TechTrivia.test.tsx
```

- [ ] **Step 3: Write `components/games/TechTrivia.tsx`**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface Question { question: string; options: string[]; answer: string; }

const QUESTIONS: Question[] = [
  { question: "What does 'GDSC' stand for?", options: ['Google Developer Student Clubs','Global Data Science Center','General Developer Software Council','Google Design & Code'], answer: 'Google Developer Student Clubs' },
  { question: 'Which Google framework is used for cross-platform mobile apps?', options: ['Flutter','React Native','Angular','Kotlin Multiplatform'], answer: 'Flutter' },
  { question: "What is Google's flagship AI model family?", options: ['Gemini','Llama','Claude','GPT'], answer: 'Gemini' },
];

interface Props { onComplete: (score: number) => void; }

export default function TechTrivia({ onComplete }: Props) {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(10);
  const completedRef = useRef(false);

  function advance(correct: boolean, remaining: number) {
    const bonus = correct ? 25 + Math.floor(remaining / 10 * 8) : 0;
    const newScore = score + bonus;
    setScore(newScore);
    if (idx < QUESTIONS.length - 1) {
      setIdx((p) => p + 1);
      setTimer(10);
    } else if (!completedRef.current) {
      completedRef.current = true;
      setActive(false);
      onComplete(newScore);
    }
  }

  useEffect(() => {
    if (!active) return;
    if (timer === 0) { advance(false, 0); return; }
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [active, timer, idx]);

  if (!active) {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <h2 className="text-xl font-bold mb-2">10-Second Speed Trivia</h2>
        <p className="text-sm text-[#5F6368] mb-6">Answer before the clock hits zero!</p>
        <button
          onClick={() => { setIdx(0); setScore(0); setTimer(10); completedRef.current = false; setActive(true); }}
          className="bg-[#1A73E8] hover:bg-[#1557B0] text-white px-8 py-3 rounded-full font-semibold shadow-md"
        >
          Start Speed Trivia
        </button>
      </div>
    );
  }

  const q = QUESTIONS[idx];
  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full flex justify-between items-center mb-4">
        <span className="text-xs font-bold text-[#5F6368]">Question {idx + 1}/3</span>
        <span className="text-sm font-black text-[#EA4335] bg-[#FCE8E6] px-3 py-1 rounded-full">
          ⏱ {timer}s
        </span>
      </div>
      <h3 className="text-lg font-bold mb-6 text-[#202124] text-center">{q.question}</h3>
      <div className="w-full flex flex-col space-y-3">
        {q.options.map((opt) => (
          <button
            key={opt}
            onClick={() => advance(opt === q.answer, timer)}
            className="w-full p-4 text-left text-sm font-medium border border-[#DADCE0] rounded-2xl hover:border-[#1A73E8] hover:bg-[#E8F0FE] transition-all"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx jest __tests__/components/games/TechTrivia.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add components/games/TechTrivia.tsx __tests__/components/games/TechTrivia.test.tsx
git commit -m "feat: TechTrivia speed round component"
```

---

### Task 12: BinaryDecoder Component

**Files:**
- Create: `components/games/BinaryDecoder.tsx`
- Create: `__tests__/components/games/BinaryDecoder.test.tsx`

**Interfaces:**
- Consumes: `onComplete: (score: number) => void`, `playerName: string`
- Produces: calls `onComplete(100)` on correct guess, `onComplete(0)` on wrong

- [ ] **Step 1: Write failing tests in `__tests__/components/games/BinaryDecoder.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import BinaryDecoder from '@/components/games/BinaryDecoder';

describe('BinaryDecoder', () => {
  it('shows binary for the player name', () => {
    render(<BinaryDecoder playerName="Ahmad" onComplete={jest.fn()} />);
    // 'A' = 65 = 01000001
    expect(screen.getByText(/01000001/)).toBeInTheDocument();
  });

  it('calls onComplete(100) for correct binary guess', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. 01000001/i), { target: { value: '01000001' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('calls onComplete(0) for wrong binary guess', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. 01000001/i), { target: { value: '11111111' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(onComplete).toHaveBeenCalledWith(0);
  });

  it('does not call onComplete twice on double click', () => {
    const onComplete = jest.fn();
    render(<BinaryDecoder playerName="Ahmad" onComplete={onComplete} />);
    fireEvent.change(screen.getByPlaceholderText(/e.g. 01000001/i), { target: { value: '01000001' } });
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx jest __tests__/components/games/BinaryDecoder.test.tsx
```

- [ ] **Step 3: Write `components/games/BinaryDecoder.tsx`**

```tsx
'use client';

import { useState, useRef } from 'react';

interface Props { playerName: string; onComplete: (score: number) => void; }

function toBinary(str: string): string {
  return str.split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
}

export default function BinaryDecoder({ playerName, onComplete }: Props) {
  const [guess, setGuess] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const doneRef = useRef(false);

  function verify() {
    if (doneRef.current) return;
    const expected = playerName.charAt(0).charCodeAt(0).toString(2).padStart(8, '0');
    const correct = guess.trim() === expected;
    setStatus(correct ? 'correct' : 'wrong');
    doneRef.current = true;
    onComplete(correct ? 100 : 0);
  }

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-1 text-center">Binary Name Decoder</h2>
      <p className="text-xs text-[#5F6368] mb-6 text-center">
        Your name in 8-bit binary:
      </p>

      <div className="w-full bg-[#F8F9FA] border border-[#DADCE0] rounded-2xl p-4 mb-6 text-center">
        <p className="text-xs font-bold text-[#5F6368] mb-1">YOUR NAME IN BINARY:</p>
        <p className="font-mono text-xs md:text-sm text-[#1A73E8] break-all font-semibold">
          {toBinary(playerName)}
        </p>
      </div>

      <div className="w-full border-t border-[#DADCE0] pt-4 flex flex-col items-center">
        <p className="text-xs font-bold mb-3 text-center">
          Mini Challenge: What is the 8-bit binary for &apos;{playerName.charAt(0)}&apos;?
        </p>
        <div className="flex w-full space-x-2">
          <input
            type="text"
            placeholder="e.g. 01000001"
            maxLength={8}
            value={guess}
            disabled={doneRef.current}
            onChange={(e) => setGuess(e.target.value)}
            className="flex-1 p-2.5 border border-[#DADCE0] rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1A73E8]"
          />
          <button
            onClick={verify}
            disabled={!guess || doneRef.current}
            className="bg-[#34A853] hover:bg-[#2C8E45] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-semibold"
          >
            Verify
          </button>
        </div>
        {status === 'correct' && (
          <p className="text-xs font-bold text-[#34A853] mt-2">Correct! You earned 100 points! 🎉</p>
        )}
        {status === 'wrong' && (
          <p className="text-xs font-bold text-[#EA4335] mt-2">Not quite — look at the binary above!</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx jest __tests__/components/games/BinaryDecoder.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add components/games/BinaryDecoder.tsx __tests__/components/games/BinaryDecoder.test.tsx
git commit -m "feat: BinaryDecoder game component"
```

---

### Task 13: PasswordChallenge Component

**Files:**
- Create: `components/games/PasswordChallenge.tsx`
- Create: `__tests__/components/games/PasswordChallenge.test.tsx`

**Interfaces:**
- Consumes: `onComplete: (score: number) => void`
- Produces: calls `onComplete(score)` where `score = calcPasswordScore(password)` on Lock In

- [ ] **Step 1: Write failing tests in `__tests__/components/games/PasswordChallenge.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordChallenge from '@/components/games/PasswordChallenge';

describe('PasswordChallenge', () => {
  it('renders password input and Lock In button', () => {
    render(<PasswordChallenge onComplete={jest.fn()} />);
    expect(screen.getByPlaceholderText(/type your password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lock in/i })).toBeInTheDocument();
  });

  it('Lock In is disabled when password is empty', () => {
    render(<PasswordChallenge onComplete={jest.fn()} />);
    expect(screen.getByRole('button', { name: /lock in/i })).toBeDisabled();
  });

  it('calls onComplete with strength score on Lock In', async () => {
    const onComplete = jest.fn();
    render(<PasswordChallenge onComplete={onComplete} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'MyP@ssw0rd123!');
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    expect(onComplete).toHaveBeenCalledWith(100);
  });

  it('does not call onComplete again after locked', async () => {
    const onComplete = jest.fn();
    render(<PasswordChallenge onComplete={onComplete} />);
    await userEvent.type(screen.getByPlaceholderText(/type your password/i), 'test1234');
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    fireEvent.click(screen.getByRole('button', { name: /lock in/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx jest __tests__/components/games/PasswordChallenge.test.tsx
```

- [ ] **Step 3: Write `components/games/PasswordChallenge.tsx`**

```tsx
'use client';

import { useState, useRef } from 'react';
import { calcPasswordScore } from '@/lib/scoring';

interface Props { onComplete: (score: number) => void; }

const TIPS = [
  { label: '8+ chars', check: (p: string) => p.length >= 8 },
  { label: '12+ chars', check: (p: string) => p.length >= 12 },
  { label: 'Uppercase', check: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number', check: (p: string) => /[0-9]/.test(p) },
  { label: 'Symbol', check: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function PasswordChallenge({ onComplete }: Props) {
  const [password, setPassword] = useState('');
  const [locked, setLocked] = useState(false);
  const doneRef = useRef(false);
  const score = calcPasswordScore(password);

  function lockIn() {
    if (doneRef.current || !password) return;
    doneRef.current = true;
    setLocked(true);
    onComplete(score);
  }

  const barColor = score >= 75 ? '#34A853' : score >= 50 ? '#FBBC04' : '#EA4335';

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-lg font-bold mb-1 text-center">Password Challenge 🔐</h2>
      <p className="text-xs text-[#5F6368] mb-6 text-center">
        Build the strongest password you can. Your score counts toward the leaderboard!
      </p>

      <input
        type="password"
        placeholder="Type your password..."
        maxLength={128}
        value={password}
        disabled={locked}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full p-3.5 border border-[#DADCE0] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1A73E8] text-sm mb-4"
      />

      <div className="w-full bg-[#DADCE0] h-3 rounded-full overflow-hidden mb-2">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{ width: `${score}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="text-right w-full text-xs font-bold text-[#5F6368] mb-4">{score}% Strength</p>

      <div className="w-full flex flex-wrap gap-2 mb-6">
        {TIPS.map(({ label, check }) => (
          <span
            key={label}
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              check(password)
                ? 'bg-[#E6F4EA] text-[#137333]'
                : 'bg-[#F8F9FA] text-[#5F6368]'
            }`}
          >
            {check(password) ? '✓' : '○'} {label}
          </span>
        ))}
      </div>

      <button
        onClick={lockIn}
        disabled={!password || locked}
        className="w-full bg-[#34A853] hover:bg-[#2C8E45] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-full transition-all"
      >
        {locked ? `Locked in — ${score} pts` : 'Lock In'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx jest __tests__/components/games/PasswordChallenge.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add components/games/PasswordChallenge.tsx __tests__/components/games/PasswordChallenge.test.tsx
git commit -m "feat: PasswordChallenge solo game component"
```

---

### Task 14: TabBar Component

**Files:**
- Create: `components/TabBar.tsx`
- Create: `__tests__/components/TabBar.test.tsx`

**Interfaces:**
- Consumes: `activeTab: Tab`, `completedTabs: Set<Tab>`, `onTabChange: (tab: Tab) => void`
- Produces: renders 4 tab buttons; active tab highlighted; completed tabs show ✓

- [ ] **Step 1: Write failing tests in `__tests__/components/TabBar.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import TabBar from '@/components/TabBar';
import type { Tab } from '@/lib/types';

describe('TabBar', () => {
  const tabs: Tab[] = ['riddles', 'trivia', 'binary', 'password'];

  it('renders all 4 tabs', () => {
    render(<TabBar activeTab="riddles" completedTabs={new Set()} onTabChange={jest.fn()} />);
    expect(screen.getByText(/emoji/i)).toBeInTheDocument();
    expect(screen.getByText(/trivia/i)).toBeInTheDocument();
    expect(screen.getByText(/binary/i)).toBeInTheDocument();
    expect(screen.getByText(/password/i)).toBeInTheDocument();
  });

  it('calls onTabChange with correct tab', () => {
    const onTabChange = jest.fn();
    render(<TabBar activeTab="riddles" completedTabs={new Set()} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText(/trivia/i));
    expect(onTabChange).toHaveBeenCalledWith('trivia');
  });

  it('shows checkmark for completed tabs', () => {
    render(<TabBar activeTab="riddles" completedTabs={new Set<Tab>(['trivia'])} onTabChange={jest.fn()} />);
    expect(screen.getByText(/✓/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx jest __tests__/components/TabBar.test.tsx
```

- [ ] **Step 3: Write `components/TabBar.tsx`**

```tsx
'use client';

import type { Tab } from '@/lib/types';

const TAB_LABELS: Record<Tab, string> = {
  riddles: '🧩 Emoji',
  trivia: '⚡ Trivia',
  binary: '🔢 Binary',
  password: '🔐 Password',
};

interface Props {
  activeTab: Tab;
  completedTabs: Set<Tab>;
  onTabChange: (tab: Tab) => void;
}

export default function TabBar({ activeTab, completedTabs, onTabChange }: Props) {
  return (
    <nav className="w-full bg-[#E2E7EB] p-1.5 rounded-full flex justify-between space-x-1 mb-6 shadow-inner">
      {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
        const isActive = activeTab === tab;
        const done = completedTabs.has(tab);
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 py-2.5 px-2 text-xs md:text-sm font-semibold rounded-full transition-all duration-200 ${
              isActive
                ? 'bg-white text-[#1A73E8] shadow-md'
                : 'text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            {TAB_LABELS[tab]} {done ? '✓' : ''}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npx jest __tests__/components/TabBar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add components/TabBar.tsx __tests__/components/TabBar.test.tsx
git commit -m "feat: TabBar component with completion indicators"
```

---

### Task 15: Game Hub Page + SuccessScreen

**Files:**
- Create: `app/play/page.tsx`
- Create: `components/SuccessScreen.tsx`
- Create: `__tests__/app/play/page.test.tsx`

**Interfaces:**
- Consumes: `sessionStorage.playerToken`, `sessionStorage.playerName`
- Produces: renders game hub; on all 4 complete + submit → shows SuccessScreen with rank + Google Form link

- [ ] **Step 1: Write failing tests in `__tests__/app/play/page.test.tsx`**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PlayPage from '@/app/play/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
global.fetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
});

describe('Play Page', () => {
  it('redirects to / when no session in sessionStorage', async () => {
    render(<PlayPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'));
  });

  it('renders game hub with TabBar when session exists', () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    render(<PlayPage />);
    expect(screen.getByText(/emoji/i)).toBeInTheDocument();
  });

  it('Submit button is disabled until all 4 games completed', () => {
    sessionStorage.setItem('playerToken', 'tok');
    sessionStorage.setItem('playerName', 'Ahmad');
    render(<PlayPage />);
    expect(screen.getByRole('button', { name: /submit score/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx jest __tests__/app/play/page.test.tsx
```

- [ ] **Step 3: Write `components/SuccessScreen.tsx`**

```tsx
interface Props { name: string; total: number; rank: number; }

export default function SuccessScreen({ name, total, rank }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-8 space-y-4">
      <div className="text-5xl">🏆</div>
      <h2 className="text-2xl font-extrabold text-[#202124]">Well done, {name}!</h2>
      <p className="text-4xl font-black text-[#1A73E8]">{total} <span className="text-xl font-semibold text-[#5F6368]">/ 400 pts</span></p>
      <p className="text-sm font-bold text-[#34A853]">You are #{rank} on the leaderboard!</p>
      <a
        href="https://forms.gle/PLACEHOLDER"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 bg-[#34A853] hover:bg-[#2C8E45] text-white font-bold px-8 py-3 rounded-full text-sm transition-all shadow"
      >
        Join GDSC →
      </a>
      <a href="/leaderboard" className="text-xs text-[#1A73E8] underline">View Live Leaderboard</a>
    </div>
  );
}
```

- [ ] **Step 4: Write `app/play/page.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TabBar from '@/components/TabBar';
import EmojiRiddles from '@/components/games/EmojiRiddles';
import TechTrivia from '@/components/games/TechTrivia';
import BinaryDecoder from '@/components/games/BinaryDecoder';
import PasswordChallenge from '@/components/games/PasswordChallenge';
import SuccessScreen from '@/components/SuccessScreen';
import type { Tab } from '@/lib/types';

export default function PlayPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('riddles');
  const [scores, setScores] = useState<Record<Tab, number | null>>({
    riddles: null, trivia: null, binary: null, password: null,
  });
  const [result, setResult] = useState<{ rank: number; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = sessionStorage.getItem('playerToken');
    const n = sessionStorage.getItem('playerName');
    if (!t || !n) { router.push('/'); return; }
    setToken(t);
    setName(n);
  }, [router]);

  function handleComplete(tab: Tab, score: number) {
    setScores((prev) => ({ ...prev, [tab]: score }));
  }

  const allDone = Object.values(scores).every((s) => s !== null);

  async function handleSubmit() {
    if (!allDone || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const submissionId = crypto.randomUUID();
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, submissionId, scores }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Submission failed');
      setResult(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!name) return null;

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white border border-[#DADCE0] rounded-3xl p-8 shadow-sm">
          <SuccessScreen name={name} total={result.total} rank={result.rank} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-2xl text-center mb-6">
        <h1 className="text-xl font-extrabold">Hey {name} 👋</h1>
        <p className="text-sm text-[#5F6368]">Complete all 4 games to submit your score</p>
      </header>

      <div className="w-full max-w-2xl">
        <TabBar activeTab={activeTab} completedTabs={new Set(Object.entries(scores).filter(([,v]) => v !== null).map(([k]) => k as Tab))} onTabChange={setActiveTab} />

        <main className="bg-white border border-[#DADCE0] rounded-3xl p-6 md:p-8 shadow-sm mb-4">
          {activeTab === 'riddles' && <EmojiRiddles onComplete={(s) => handleComplete('riddles', s)} />}
          {activeTab === 'trivia' && <TechTrivia onComplete={(s) => handleComplete('trivia', s)} />}
          {activeTab === 'binary' && <BinaryDecoder playerName={name} onComplete={(s) => handleComplete('binary', s)} />}
          {activeTab === 'password' && <PasswordChallenge onComplete={(s) => handleComplete('password', s)} />}
        </main>

        {error && <p className="text-xs text-[#EA4335] text-center mb-2">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!allDone || submitting}
          className="w-full bg-[#1A73E8] hover:bg-[#1557B0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-full transition-all shadow"
        >
          {submitting ? 'Submitting…' : 'Submit Score'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect pass**

```bash
npx jest __tests__/app/play/page.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add app/play/page.tsx components/SuccessScreen.tsx __tests__/app/play/page.test.tsx
git commit -m "feat: game hub page and success screen"
```

---

### Task 16: Leaderboard Page

**Files:**
- Create: `components/LeaderboardTable.tsx`
- Create: `app/leaderboard/page.tsx`
- Create: `__tests__/components/LeaderboardTable.test.tsx`

**Interfaces:**
- Consumes: `entries: LeaderboardEntry[]`
- Produces: sorted table of top 20; top 3 highlighted with brand colors; auto-updates via Firebase `onValue`

- [ ] **Step 1: Write failing tests in `__tests__/components/LeaderboardTable.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import LeaderboardTable from '@/components/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/types';

const entries: LeaderboardEntry[] = [
  { name: 'Ahmad', score: 350, timestamp: 1, expiresAt: 9999999999999 },
  { name: 'Sara', score: 400, timestamp: 2, expiresAt: 9999999999999 },
  { name: 'Ali', score: 200, timestamp: 3, expiresAt: 9999999999999 },
];

describe('LeaderboardTable', () => {
  it('renders sorted by score descending', () => {
    render(<LeaderboardTable entries={entries} />);
    const rows = screen.getAllByRole('row');
    // rows[0] = header, rows[1] = Sara (400), rows[2] = Ahmad (350)
    expect(rows[1]).toHaveTextContent('Sara');
    expect(rows[1]).toHaveTextContent('400');
    expect(rows[2]).toHaveTextContent('Ahmad');
  });

  it('shows top 20 only', () => {
    const many: LeaderboardEntry[] = Array.from({ length: 25 }, (_, i) => ({
      name: `Player${i}`, score: i * 10, timestamp: i, expiresAt: 9999999999999,
    }));
    render(<LeaderboardTable entries={many} />);
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(21); // 1 header + 20 data rows
  });

  it('shows empty state when no entries', () => {
    render(<LeaderboardTable entries={[]} />);
    expect(screen.getByText(/no scores yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npx jest __tests__/components/LeaderboardTable.test.tsx
```

- [ ] **Step 3: Write `components/LeaderboardTable.tsx`**

```tsx
import type { LeaderboardEntry } from '@/lib/types';

const RANK_STYLES = ['text-[#4285F4]', 'text-[#EA4335]', 'text-[#FBBC04]'];
const RANK_MEDALS = ['🥇', '🥈', '🥉'];

interface Props { entries: LeaderboardEntry[]; }

export default function LeaderboardTable({ entries }: Props) {
  const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, 20);

  if (sorted.length === 0) {
    return <p className="text-center text-[#5F6368] py-8">No scores yet — be the first!</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#DADCE0]">
          <th className="py-3 text-left font-bold text-[#5F6368] w-12">Rank</th>
          <th className="py-3 text-left font-bold text-[#5F6368]">Name</th>
          <th className="py-3 text-right font-bold text-[#5F6368]">Score</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((entry, i) => (
          <tr key={`${entry.name}-${entry.timestamp}`} className="border-b border-[#F8F9FA]">
            <td className={`py-3 font-black text-lg ${RANK_STYLES[i] ?? 'text-[#202124]'}`}>
              {RANK_MEDALS[i] ?? `#${i + 1}`}
            </td>
            <td className="py-3 font-semibold text-[#202124]">{entry.name}</td>
            <td className="py-3 text-right font-bold text-[#1A73E8]">{entry.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Write `app/leaderboard/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '@/lib/firebase';
import LeaderboardTable from '@/components/LeaderboardTable';
import type { LeaderboardEntry } from '@/lib/types';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const leaderboardRef = ref(db, 'leaderboard');
    const unsub = onValue(leaderboardRef, (snap) => {
      const data = snap.val() as Record<string, LeaderboardEntry> | null;
      setEntries(data ? Object.values(data) : []);
    });
    return unsub;
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-2xl text-center mb-8">
        <div className="flex items-center justify-center space-x-0.5 mb-3">
          {[['G','#4285F4'],['o','#EA4335'],['o','#FBBC04'],['g','#4285F4'],['l','#34A853'],['e','#EA4335']].map(([c,col],i) => (
            <span key={i} className="text-3xl font-bold" style={{ color: col as string }}>{c}</span>
          ))}
        </div>
        <h1 className="text-3xl font-extrabold">Live Leaderboard</h1>
        <p className="text-sm text-[#5F6368] mt-1">Updates in real-time as players submit scores</p>
      </header>

      <div className="w-full max-w-2xl bg-white border border-[#DADCE0] rounded-3xl p-6 md:p-8 shadow-sm">
        <LeaderboardTable entries={entries} />
      </div>

      <p className="mt-6 text-xs text-[#5F6368]">Scores reset automatically after 24 hours</p>
    </div>
  );
}
```

- [ ] **Step 5: Run — expect pass**

```bash
npx jest __tests__/components/LeaderboardTable.test.tsx
```

- [ ] **Step 6: Run full test suite**

```bash
npx jest
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add components/LeaderboardTable.tsx app/leaderboard/page.tsx __tests__/components/LeaderboardTable.test.tsx
git commit -m "feat: live leaderboard page and table component"
```

---

### Task 17: Full Run + Deployment Verification

**Files:**
- Modify: `.env.local` (created from `.env.local.example` with real values)

**Interfaces:**
- Consumes: all tasks 1–16
- Produces: working app at `localhost:3000`; deployed to Vercel

- [ ] **Step 1: Copy env example and fill in values**

```bash
cp .env.local.example .env.local
```

Fill in: Firebase project config, Firebase Admin service account credentials, Upstash Redis URL + token, `SESSION_SECRET` (generate with `openssl rand -hex 32`), `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local dev.

- [ ] **Step 2: Set Firebase security rules**

In Firebase Console → Realtime Database → Rules, paste:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "leaderboard": {
      ".read": true,
      ".write": false
    }
  }
}
```

- [ ] **Step 3: Run dev server and smoke-test all 4 games**

```bash
npm run dev
```

Manual test checklist:
- [ ] Enter name on `/` → consent notice visible → Start → redirected to `/play`
- [ ] Play EmojiRiddles through all 4 questions → tab shows ✓
- [ ] Start TechTrivia → answer all 3 → tab shows ✓
- [ ] BinaryDecoder: enter name, try correct binary → Correct message → tab shows ✓
- [ ] PasswordChallenge: type strong password → Lock In → tab shows ✓
- [ ] Submit Score unlocks → click → SuccessScreen shows score + rank + Join GDSC button
- [ ] Open `/leaderboard` → your entry appears in real time

- [ ] **Step 4: Run full test suite one more time**

```bash
npx jest --coverage
```

Expected: all tests pass

- [ ] **Step 5: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 6: Deploy to Vercel**

```bash
npx vercel --prod
```

Or connect the GitHub repo in the Vercel dashboard. Add all env vars from `.env.local.example` in Vercel Project Settings → Environment Variables. Set `NEXT_PUBLIC_APP_URL` to the production Vercel URL.

- [ ] **Step 7: Smoke-test production URL**

Repeat the manual test checklist in Step 3 on the live Vercel URL.

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "chore: verify deployment and complete booth app"
git push origin main
```
