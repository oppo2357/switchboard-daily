# SWITCHBOARD — Daily Signal Relay Puzzle for Reddit

Built natively on **Reddit Devvit Web** (`@devvit/web@0.15.4`, React 19, Tailwind CSS 4, Hono serverless API, and Redis) for **Reddit's Game of the Day Hackathon 2026**.

## Core Daily Loop
Every day at `00:00 UTC`, every operator in the subreddit receives the exact same mathematically verified, guaranteed-solvable 5×5 ceramic-and-brass **Switchboard** puzzle with an exact **Par** move count.

1. **Tap any ceramic switch tile** to rotate it 90° clockwise. Live vermilion signal current propagates instantaneously across matching copper traces.
2. **Energize every ⚡ Relay node and the OUT terminal** in **Par moves or fewer** to earn the `⚡ PAR CIRCUIT` medal.
3. **1-Click Spoiler-Free Comment Share**: Post your 5×5 emoji circuit scorecard (`🟠 / 🟧 / ⚡ / 🟢 / ⬛`) directly to the Reddit post comments via `reddit.submitComment` (`runAs: 'USER'`) so the community can compare routes without spoiling the solution.
4. **Live Subreddit Telemetry & Daily Streak (Redis)**: Tracks consecutive UTC daily streaks, Top 10 daily operators (ranked by moves then speed), subreddit Par-rate %, and the day's "Hottest Tile" community hotspot.
5. **7-Day Archive & Community Puzzle Forge**: Catch up on the last 7 daily switchboards or forge & publish your own verified-solvable custom board straight into the subreddit's Redis Community Rack.

## Architecture
- `devvit.json`: Declares the fast inline feed entrypoint (`splash.html`), expanded game entrypoint (`game.html`), Hono server (`dist/server/index.cjs`), moderator menu item (`Post Today's Switchboard`), and `onAppInstall` trigger.
- `src/shared/puzzle.ts`: Deterministic UTC seeded daily puzzle generator, live BFS circuit propagation evaluator, exact rotational-period Par calculator, and spoiler-free emoji scorecard formatter.
- `src/server/routes/api.ts`: Hono endpoints (`/api/init`, `/api/solve`, `/api/share`, `/api/forge`) persisted in Devvit Redis (`hSet`, `hIncrBy`, `zAdd`, `zRange`).
- `src/client/splash.tsx` & `src/client/game.tsx`: Tactile Braun / Teenage Engineering inspired ceramic-and-brass hardware UI with zero-dependency Web Audio mechanical relay click synthesis.

## Commands
```bash
npm install
npm run test:unit    # Verifies 30 consecutive days of deterministic solvability & exact Par
npm run test:types   # Strict TypeScript build check (client, server, shared)
npm run lint         # ESLint check across src/
npm run build        # Builds dist/client and dist/server/index.cjs via @devvit/start/vite
npm run login        # Authenticate with your Reddit developer account
npm run deploy       # Upload to Reddit Developer Portal (developers.reddit.com/apps/switchboard-daily)
npm run dev          # Playtest live on your test subreddit
```
