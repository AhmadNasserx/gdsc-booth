# GDSC Booth: Interactive Tech Station

The booth app for **Google Developer Groups on Campus, Beirut Arab University, Tripoli Campus**. Students walk up to a device, enter a display name, play three short tech mini-games, once each, in order, and land on a live leaderboard. The player at the top of the leaderboard at the end of the day wins a prize. A second screen at the booth shows the leaderboard updating in real time once it is revealed with a PIN, and the finish screen links to the chapter sign-up form.

**50 students played the first version at the club fair.** It was designed, built and deployed in three days. It has since been reworked into a prize edition in which every game counts toward one leaderboard total.

> **Status:** the first version ran live at the club fair in September 2026 and is now offline. The screenshots and video below come from a local run of that version, with sample names on the leaderboard. They predate the prize edition, so the hub, result screen and per-game scoring aren't pictured yet.

<p align="center">
  <img src="docs/screenshots/playthrough.gif" width="300" alt="A playthrough of an earlier version: entering a name, playing, submitting and landing on the leaderboard (sped up 2x)">
</p>
<p align="center"><sub>Earlier version, sped up 2×. <a href="docs/screenshots/playthrough.mp4">Watch it at normal speed (MP4, 1:25)</a>.</sub></p>

## Screenshots

| Name entry | Emoji Riddles |
|---|---|
| <img src="docs/screenshots/name-entry.webp" width="260" alt="Name entry screen with consent notice"> | <img src="docs/screenshots/emoji-riddles.webp" width="260" alt="Emoji Riddles question"> |

| Finish | Leaderboard (phone) |
|---|---|
| <img src="docs/screenshots/success.webp" width="260" alt="Finish screen with score, rank and Join GDSC button"> | <img src="docs/screenshots/leaderboard-phone.webp" width="260" alt="Leaderboard on a phone"> |

**Booth second screen:**

<img src="docs/screenshots/leaderboard-screen.webp" alt="Live leaderboard on the booth's second screen with a podium for the top three">

## How a visit works

1. **Name.** Players choose a display name. It is reserved for 48 hours, and returning players on the same browser get their name back.
2. **Play.** The three games start one after another, in a fixed order: Emoji Riddles, Memory Match, Tech Trivia. Each is played once.
3. **Result.** After each game the player sees the points they earned, their total and rank, and a button for the next game.
4. **Finish.** After the last game the player sees their final total and rank, and the sign-up form (the leaderboard is hidden). Reloading the page picks up at the next unplayed game.

## The games

Every player plays **three games**, in order, **once each**. The server refuses to start a game that was already played or that is out of order. A game abandoned part-way (for example by closing the tab) can be started again, because it only counts once its score is recorded. Each game is graded on the server.

| Game | What you do | How it scores |
|---|---|---|
| Emoji Riddles | Work out the tech term or everyday word hidden in a row of emoji | Every correct answer scores. Faster finishes score more. |
| Memory Match | Flip cards and match 8 tech pairs | Fewer moves score more. Faster finishes score more. |
| Tech Trivia | Fast round of tech and general trivia | Right answers add, wrong ones cost you. Faster finishes score more. |

Each run gets a fresh random set of questions and a newly shuffled Memory Match layout, with answer options shuffled so the right answer isn't always in the same spot.

## Scoring and the leaderboard

- **Your total** is the sum of your score in each of the three games. There are no replays, so every player gets one attempt at each game.
- **Each game adds one score.** A player who has not finished all three has fewer scores adding up.
- **Ties** are rare, because every score includes a speed bonus: faster finishes score more. If two totals still match, whoever reached their total first ranks higher.
- **The leaderboard is hidden.** `/leaderboard` shows a PIN screen, and the scores are only sent by the server (`POST /api/leaderboard`) for the right `LEADERBOARD_PIN`. Players see their own rank after each game, but not the board. Use a PIN of 6+ digits; wrong guesses are slowed down but not locked out.
- Once revealed, the leaderboard shows the top 20 players, with small emoji chips for the games each player has a score in.

## Keeping the leaderboard honest

A public leaderboard with a prize at the end of the day is an open invitation to cheat, so the browser is never trusted with a score.

- **Answers stay on the server.** Correct answers and the Memory Match layout are never sent to the browser before the player has acted. Answers to Emoji Riddles and Tech Trivia never reach the browser before the player submits them, and the browser learns which were right only from the server's reply to that submission.
- **Graded on the server.** Emoji Riddles and Tech Trivia are graded in one batch when the round ends: the browser sends all of its answers together, and the server grades them then. Memory Match is graded step by step, one card flip at a time. The server keeps each run's state in one transaction, so double taps can't count twice.
- **The server measures time.** Each run's duration is taken from the server's clock, not the browser's.
- **One run at a time.** A run can be finished only once. Memory Match takes its flips one at a time, in order, with no retries. Each game can be played once and only in order, which the server checks against the leaderboard. Starting a new run of a game ends any earlier run of that game that is still open.
- **Sessions expire.** Session tokens are encrypted, carry only the name and an issue time, and last 90 minutes.
- **Unique names.** A display name is reserved for 48 hours, so nobody can pose as another player.
- **Locked-down headers.** A Content-Security-Policy limits scripts and connections to the app and Firebase.

**Known limit:** the game endpoints are public HTTP routes, so a determined player can script their way through the games without the browser. The end-of-game review also shows the correct answers, so a script that plays many rounds could collect the question pool and later replay known answers. Server grading and timing make this harder, not impossible. For that reason the prize winner should be confirmed in person before the prize is handed over.

## Privacy

- Players give only a display name, and a consent notice on the entry screen says it will appear publicly.
- Every record is written with an `expiresAt` timestamp 48 hours out. A daily Vercel cron job (`/api/cron/cleanup`, protected by `CRON_SECRET`) deletes anything past it, along with expired game runs.
- No IP addresses or other identifiers are stored.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Firebase Realtime Database (Admin SDK on the server) · Vercel (hosting and cron) · Jest and React Testing Library

### API routes

| Route | Purpose |
|---|---|
| `POST /api/session` | Checks and reserves a display name, and issues a session token (no game content) |
| `GET /api/names/check` | Whether a display name is free, or already held by this browser |
| `POST /api/game/start` | Starts a fresh run of one game and returns its questions or board, with no answers |
| `POST /api/game/action` | Submits one action for a run (a batch of answers or a card flip) and returns the graded result |
| `POST /api/me` | The player's name, total, rank and score in each game |
| `POST /api/leaderboard` | Leaderboard entries, only for the right PIN |
| `GET /api/cron/cleanup` | Daily cleanup of expired names, leaderboard entries and game runs |

### Project structure

```
app/
  page.tsx               name entry, consent and the end-of-day prize notice
  play/page.tsx          game flow: hub, loading, game, result
  leaderboard/page.tsx   live leaderboard for the booth screen
  api/session            issues session tokens
  api/game/start         starts a run
  api/game/action        grades one action and finishes runs
  api/me                 the player's scores
  api/leaderboard        leaderboard read via the Admin SDK
  api/names/check        display-name availability
  api/cron/cleanup       deletes expired records
components/games/        the three mini-games
components/              game hub, result screen, leaderboard table
lib/                     shared API types, client API wrappers, session helpers,
                         server scoring, game metadata, question pools, Firebase
__tests__/               unit, component, page and API route tests
```

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Key material for the encrypted session tokens |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK service account |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_DATABASE_URL`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase client config |
| `CRON_SECRET` | Bearer token Vercel sends to the cleanup cron |
| `LEADERBOARD_PIN` | PIN that reveals the hidden leaderboard. If it is not set, the leaderboard stays hidden for everyone |

```bash
npm test        # Jest
npm run lint
npm run build
```


## Author

Built by [Ahmad Nasser](https://ahmadnasserx.com), Tech Lead, GDG on Campus BAU Tripoli.
