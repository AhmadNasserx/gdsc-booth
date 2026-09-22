# GDSC Booth Interactive Tech Station — Design Spec

**Date:** 2026-09-22 (security-patched after audit)
**Stack:** Next.js (App Router) · Vercel (Hobby — free) · Firebase Realtime Database (Spark — free) · Upstash Redis (free)

---

## Overview

A single-day booth web app for Google Developer Student Clubs. Students walk up to a device, enter a display name, play four tech mini-games, submit a combined score to a real-time leaderboard, then get a link to join GDSC via Google Form. A second screen at the booth shows the live leaderboard.

All free tier. No credit card required on any platform.

---

## Privacy & Legal

**Data collected:** display name (not full legal name) + score + timestamp.

**Consent notice** shown on the name entry screen before submission:
> "Your display name and score will appear on today's public leaderboard and will be deleted automatically after 24 hours."

**Data retention:** every leaderboard entry is written with an `expiresAt` field (timestamp + 24h). A Vercel cron job runs once daily at midnight to delete expired entries. No manual console deletion required.

**IP addresses:** never stored in Firebase. Used transiently for rate limiting via Upstash Redis (hashed with SHA-256 before use as a key) and discarded.

**Jurisdiction:** GDPR-aligned (minimized PII, stated purpose, automatic deletion, no marketing use).

---

## User Flow

```
/ (name entry)
  └── enter display name → consent notice → Start
      server issues signed session token (HMAC, 30-min TTL)

/play (game hub)
  └── 4 tabs, any order
      each tab: onComplete(score) fires once and locks
      all 4 completed → "Submit Score" button unlocks
      client generates submissionId (crypto.randomUUID())
      POST /api/score (session token + submissionId + scores)
      → SuccessScreen: final score + rank + Google Form CTA

/leaderboard (second screen at booth)
  └── Firebase onValue subscription
      top 20 players, ranked by combined score
      auto-updates as new scores arrive
```

---

## Scoring

| Game | Max Points | How |
|---|---|---|
| Emoji Riddles | 100 | 25pts × 4 correct answers |
| Tech Trivia | 100 | 25pts base + up to 8pts time bonus per question (3 questions) |
| Binary Decoder | 100 | 100pts for correct binary guess, 0 otherwise |
| Password Challenge | 100 | Strength % (length, uppercase, digits, symbols) |
| **Total** | **400** | Combined across all four |

**Valid score sets per game (server enforces):**
- `riddles`: must be one of `{0, 25, 50, 75, 100}`
- `trivia`: must be in `[0, 99]` (sum of per-question base + time bonus)
- `binary`: must be one of `{0, 100}`
- `password`: must be in `[0, 100]` (integer)

Each game fires `onComplete(score: number)` exactly once per session. Re-visiting a tab after completion shows result but does not re-fire.

---

## Architecture

```
app/
├── page.tsx                    # Name entry + consent notice
├── play/
│   └── page.tsx                # Game hub — tab bar + game routing
├── leaderboard/
│   └── page.tsx                # Live leaderboard (second screen)
└── api/
    ├── session/route.ts        # POST — issues signed session token
    └── score/route.ts          # POST — validated score submission

components/
├── games/
│   ├── EmojiRiddles.tsx
│   ├── TechTrivia.tsx
│   ├── BinaryDecoder.tsx
│   └── PasswordChallenge.tsx
├── TabBar.tsx
├── SuccessScreen.tsx           # Final score + Google Form link
└── LeaderboardTable.tsx

lib/
├── firebase.ts                 # Firebase client init (read-only)
├── firebaseAdmin.ts            # Firebase Admin SDK (server writes only)
├── session.ts                  # HMAC token sign + verify
├── rateLimit.ts                # Upstash Redis rate limiter
└── scoring.ts                  # Score validation constants + plausibility checks
```

---

## Firebase Data Model

```
/leaderboard/{pushId}
  name:        string   (sanitized display name, max 30 chars)
  score:       number   (0–400, integer)
  timestamp:   number   (Unix ms)
  expiresAt:   number   (Unix ms, timestamp + 86400000)

/submissions/{submissionId}
  rank:        number
  expiresAt:   number   (Unix ms, timestamp + 86400000)
```

**Security rules — explicit root deny, leaderboard read-only:**

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

All writes go through API routes using Firebase Admin SDK. Clients can only read `/leaderboard`.

---

## API Routes

### POST /api/session

Called when the player clicks Start on the name entry screen.

**Request body:** `{ "name": "Display Name" }`

**Validation:**
- Name: non-empty string, strip HTML entities, max 30 chars
- No rate limit on session creation (anyone can start)

**Response:** `{ "token": "<hmac-signed-jwt>" }` — short-lived (30 min), contains `{ sessionId, name, issuedAt }`

Token is stored in `sessionStorage` alongside the name.

---

### POST /api/score

**Request body:**
```json
{
  "token": "<session token>",
  "submissionId": "<crypto.randomUUID()>",
  "scores": { "riddles": 75, "trivia": 90, "binary": 100, "password": 82 }
}
```

**Server-side validation (in order):**
1. Verify HMAC session token — reject if invalid or expired (>30 min old)
2. Check `Origin` header matches `NEXT_PUBLIC_APP_URL` — reject with 403 if not
3. Check Upstash Redis: `sessionId` key — reject with 429 if already submitted
4. Check Firebase `/submissions/{submissionId}` — if exists, return cached rank (idempotent retry)
5. Validate each score against its valid set (see Scoring section)
6. Validate total = sum of four scores, max 400
7. Sanitize name from token (HTML strip, max 30 chars)

**On success:**
- Set `sessionId` key in Upstash Redis with 10-minute TTL (prevents duplicate submissions)
- Write to `/leaderboard/{pushId}` with `expiresAt`
- Write to `/submissions/{submissionId}` with rank and `expiresAt`
- Return `{ rank, total }`

**On failure:** return 400/429/403 with error message, nothing written

---

## Rate Limiting

Uses **Upstash Redis** (free tier: 10,000 req/day — sufficient for a booth).

```ts
// lib/rateLimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(1, '10 m'),
  prefix: 'gdsc-booth',
});
// Key: SHA-256 hash of sessionId (never raw IP stored)
```

---

## Session Token

```ts
// lib/session.ts — HMAC-SHA256 signed, base64url encoded
// Payload: { sessionId, name, issuedAt }
// Secret: SESSION_SECRET env var (random 32-byte hex string)
// TTL: 30 minutes
```

Generated by `POST /api/session`, verified by `POST /api/score`. Stored in `sessionStorage` — never in a cookie (no CSRF surface).

---

## Data Deletion Cron

```ts
// app/api/cron/cleanup/route.ts
// Vercel cron: runs daily at 00:00 UTC
// Deletes all /leaderboard and /submissions entries where expiresAt < Date.now()
```

In `vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 0 * * *" }] }
```

Cron route protected by `Authorization: Bearer <CRON_SECRET>` header (Vercel injects this automatically).

---

## Component Details

### Name Entry (`/`)
- Input: "Choose a display name" (max 30 chars, `maxLength={30}`)
- Consent notice below input (required, non-dismissible)
- On Start: `POST /api/session` → store `{ token, name }` in `sessionStorage` → push to `/play`
- Redirect to `/play` is blocked until token is received

### Game Hub (`/play`)
- Reads `{ token, name }` from `sessionStorage` on mount; redirects to `/` if missing
- Tracks `scores: Record<Tab, number | null>` — null = not yet completed
- Submit unlocks when `Object.values(scores).every(s => s !== null)`
- On submit: generate `submissionId = crypto.randomUUID()`, POST `/api/score`

### EmojiRiddles
- 4 questions, multiple choice (4 options each)
- Answer locks after first click; 1.2s delay before advancing
- Fires `onComplete(score)` after question 4 resolves
- Score: 25pts per correct answer → valid set `{0, 25, 50, 75, 100}`

### TechTrivia
- 3 questions, 10s countdown per question (resets each question)
- Time bonus per question: `Math.floor(remainingSeconds / 10 * 8)` pts
- Timer expiry = wrong answer
- Fires `onComplete(score)` after question 3

### BinaryDecoder
- Player enters display name → full binary shown
- Challenge: type 8-bit binary for the first letter (`maxLength={8}`)
- One attempt via Verify button
- Fires `onComplete(100)` on correct, `onComplete(0)` on wrong

### PasswordChallenge
- Solo: one password input (`maxLength={128}`, `type="password"`)
- Strength bar updates live as user types
- "Lock In" button fires `onComplete(score)` — cannot change after
- Tips shown: what criteria are missing

### SuccessScreen
- Shows `total / 400` and current rank
- "Join GDSC" button → `https://forms.gle/PLACEHOLDER` (new tab)
- "View Leaderboard" → `/leaderboard`

### LeaderboardTable (`/leaderboard`)
- Firebase `onValue` on `/leaderboard`, sorted by score desc, top 20
- Rank · Name · Score columns
- Top 3 highlighted with Google brand colors
- Large font for booth readability

---

## Security Headers (`next.config.js`)

```js
headers: [
  { key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self'; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com; img-src 'self' data:; style-src 'self' 'unsafe-inline';" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]
```

---

## Environment Variables

```
# Vercel — server-only (never NEXT_PUBLIC_)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=        # Paste raw from JSON; code does .replace(/\\n/g, '\n')
SESSION_SECRET=              # Random 32-byte hex string
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=                 # Vercel auto-injects for cron routes

# Vercel — public (safe: read-only Firebase client config)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_APP_URL=         # e.g. https://gdsc-booth.vercel.app
```

**Important:** `FIREBASE_PRIVATE_KEY` from the Firebase JSON contains literal `\n` sequences. In `lib/firebaseAdmin.ts`, always apply:
```ts
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
```

---

## Security Summary

| Threat | Mitigation |
|---|---|
| Fake score submission | HMAC session token required; Admin SDK writes only |
| Score inflation (impossible values) | Per-game discrete value validation server-side |
| Repeated submission / spam | Upstash Redis sliding window (1 per sessionId per 10 min) |
| Duplicate entry on network retry | `submissionId` idempotency — returns cached rank |
| CSRF from external origin | `Origin` header check against `NEXT_PUBLIC_APP_URL` |
| Direct Firebase write | Security rules: root `.write: false`, leaderboard `.read: true` only |
| XSS via name display | Server strips HTML; React text interpolation only (no `dangerouslySetInnerHTML`) |
| PII exposure | Display name only (not legal name); auto-deleted after 24h |
| Env var leakage | Admin credentials are server-only; no `NEXT_PUBLIC_` prefix |
| Clickjacking | `X-Frame-Options: DENY` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |

---

## Styling

- Google Material 3 aesthetic
- Colors: `#4285F4` (blue) · `#EA4335` (red) · `#FBBC04` (yellow) · `#34A853` (green)
- Background: `#F8F9FA`, cards: white with `#DADCE0` border
- Font: Inter (system fallback)
- Fully responsive — tablet/laptop at the booth

---

## Out of Scope

- User authentication / accounts
- Score persistence beyond 24 hours
- Multiple events or multi-day leaderboards
- Admin panel (use Firebase console for manual inspection)
