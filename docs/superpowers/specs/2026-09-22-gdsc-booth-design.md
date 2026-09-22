# GDSC Booth Interactive Tech Station — Design Spec

**Date:** 2026-09-22
**Stack:** Next.js (App Router) · Vercel (Hobby — free) · Firebase Realtime Database (Spark — free)

---

## Overview

A single-day booth web app for Google Developer Student Clubs. Students walk up to a device, enter their name, play four tech mini-games, submit a combined score to a real-time leaderboard, then get a link to join GDSC via Google Form. A second screen at the booth shows the live leaderboard.

All free tier. No credit card required on either platform.

---

## User Flow

```
/ (name entry)
  └── enter full name → Start

/play (game hub)
  └── 4 tabs, any order
      each tab: onComplete(score) fires once per session
      all 4 completed → "Submit Score" button unlocks
      POST /api/score (server-validated)
      → SuccessScreen: final score + rank + Google Form CTA

/leaderboard (second screen at booth)
  └── live Firebase subscription
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
| Password Challenge | 100 | Strength % score (length, uppercase, digits, symbols) |
| **Total** | **400** | Combined across all four |

Each game fires `onComplete(score: number)` exactly once per session. Re-playing a tab does not update the score (first completion locks it).

---

## Architecture

```
app/
├── page.tsx                    # Name entry screen
├── play/
│   └── page.tsx                # Game hub — tab bar + game routing
├── leaderboard/
│   └── page.tsx                # Live leaderboard (second screen)
└── api/score/
    └── route.ts                # Score submission — server-side only

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
├── firebase.ts                 # Firebase client init (read-only from client)
├── firebaseAdmin.ts            # Firebase Admin SDK (server-side writes)
├── scoring.ts                  # Score cap/validation constants
└── rateLimit.ts                # In-memory IP rate limiter
```

---

## Firebase Data Model

```
/leaderboard/{pushId}
  name:      string   (sanitized, max 60 chars)
  score:     number   (0–400)
  timestamp: number   (Unix ms)
```

**Security rules — deny all direct client writes:**

```json
{
  "rules": {
    "leaderboard": {
      ".read": true,
      ".write": false
    }
  }
}
```

All writes go through `/api/score` using the Firebase Admin SDK with a service account private key stored in Vercel environment variables. Clients can only read.

---

## API Route: POST /api/score

**Request body:**
```json
{ "name": "Ahmad Nasser", "scores": { "riddles": 75, "trivia": 90, "binary": 100, "password": 82 } }
```

**Server-side validation:**
1. Name: non-empty string, stripped of HTML, max 60 chars
2. Each score: integer, within valid range for that game (0–100)
3. Total: sum of four scores, max 400
4. Rate limit: one successful submission per IP per 10 minutes (in-memory Map, sufficient for single-day use)

**On success:** writes to Firebase, returns `{ rank, total }`
**On failure:** returns 400/429 with error message, nothing written

---

## Component Details

### Name Entry (`/`)
- Single centered input: "Enter your full name"
- Validation: non-empty, max 60 chars
- On submit: saves name to `sessionStorage`, pushes to `/play`
- GDSC header with Google color wordmark

### Game Hub (`/play`)
- Reads name from `sessionStorage` on mount; redirects to `/` if missing
- Tracks `scores: Record<Tab, number | null>` — null = not yet completed
- Tracks `completed: Set<Tab>`
- Tab bar: Emoji · Trivia · Binary · Password (tabs with completion checkmarks)
- Submit button: disabled until `completed.size === 4`
- On submit: POST `/api/score`, show `SuccessScreen` on success

### EmojiRiddles
- 4 questions from `EMOJI_RIDDLES` array
- Multiple choice, 4 options
- First answer locks (no re-answer per question)
- 1.2s delay before advancing to next question
- Fires `onComplete(score)` after question 4 resolves
- Score: 25pts per correct answer

### TechTrivia
- 3 questions, 10-second countdown timer per question
- Timer resets on each question
- Time bonus: `floor(remainingSeconds / 10 * 8)` pts added to base 25
- Timer expiry counts as wrong answer
- Fires `onComplete(score)` after question 3

### BinaryDecoder
- Player enters their name → full binary representation shown
- Challenge: type the 8-bit binary for the first letter
- One attempt (verify button)
- Correct: 100pts. Wrong: 0pts
- Fires `onComplete(score)` on verify

### PasswordChallenge
- Solo: one password input, one strength bar
- Strength algorithm: length ≥8 (+25), length ≥12 (+25), uppercase (+15), digit (+15), symbol (+20) = 100 max
- Score updates live as user types
- "Lock In" button fires `onComplete(score)` — score cannot change after this
- Tips shown below bar: what they're missing

### SuccessScreen
- Shows total score out of 400
- Shows current rank ("You are #3 on the leaderboard!")
- "Join GDSC" button → opens Google Form in new tab
  - Placeholder URL: `https://forms.gle/PLACEHOLDER`
- "View Leaderboard" link → `/leaderboard`

### LeaderboardTable (`/leaderboard`)
- Firebase `onValue` subscription to `/leaderboard`
- Sorted descending by score, top 20 shown
- Columns: Rank · Name · Score
- Highlight top 3 with Google colors (🥇 blue, 🥈 red, 🥉 yellow)
- Auto-refreshes; no manual reload needed
- Large font — readable from a distance at the booth

---

## Styling

- Google Material 3 aesthetic (from existing prototype)
- Colors: `#4285F4` (blue) · `#EA4335` (red) · `#FBBC04` (yellow) · `#34A853` (green)
- Background: `#F8F9FA`, cards: white with `#DADCE0` border
- Font: Inter or Google Sans (system fallback)
- Fully responsive — works on tablet/laptop at the booth

---

## Security Summary

| Threat | Mitigation |
|---|---|
| Fake score submission | Server validates range; Admin SDK writes only |
| Score inflation via repeated submission | IP rate limit: 1 submission per 10 min |
| XSS via name field | Name stripped of HTML on server before write |
| Direct Firebase write | Security rules deny all client `.write` |
| Env var leakage | Firebase Admin key in Vercel env vars (server-only, never in client bundle) |

---

## Environment Variables

```
# Vercel (server-only)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Vercel (public — safe to expose, read-only client config)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
```

---

## Out of Scope

- User authentication / accounts
- Score persistence beyond the event day
- Multiple events or multi-day leaderboards
- Admin panel to reset scores (manual delete in Firebase console)
