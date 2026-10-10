# Project: Field Command — online app + deployment optimizer

I want to build a digital version of **Field Command** (Walter E. Johnston IV, 1991), a two-player Napoleonic strategy game with simultaneous hidden orders. It's for personal use: use original, generic art and no box art.

The project has two parts:
1. **A light online app** that two people can play on different devices. It must work at least between Mac and iOS, and ideally Android too.
2. **A research tool** that finds strong starting deployments without knowing the opponent's deployment.

Start by reading this whole brief. Then propose an architecture and a phased plan, and wait for my approval before writing code.

---

## Complete rules

**Board**
- 11×11 grid. Columns are lettered and rows are numbered (A1–K11, as in examples like A8 and G4).
- Each square has a terrain type, **forest** (green) or **open field** (beige), and an **elevation** of 1, 2 or 3.
- Each side has a deployment zone (rows behind a broken line on its own side).
- The exact terrain/elevation layout and the deployment zones are **not known yet**. I'll supply them from my physical board. Keep them in a single data file (`board.json`). Until then, use a symmetric placeholder layout and validate it against the artillery examples below.

**Armies.** Each side has 40 units, and the two sides are identical (red vs blue):
| Unit | Count | Move per day |
|---|---|---|
| General | 1 | 1 |
| Artillery | 5 | 1 |
| Infantry 1st / 2nd / 3rd rank | 3 / 10 / 4 | 2 |
| Cavalry 1st / 2nd / 3rd rank | 2 / 7 / 3 | 3 |
| Guerrillas | 5 | 3 |

**Setup.** Each player secretly places all 40 units in their own deployment zone, one unit per square.

**Each "day" (turn):**
1. Both players secretly write up to **12 orders**, each in the form `from → to`.
2. Distance is counted orthogonally, so a diagonal step costs 2. In practice this is Manhattan distance, capped by each unit's move allowance.
3. Each unit can be ordered at most once. Two units of the same side may not end on the same square. Two friendly units may swap squares. Units may jump over any unit, friend or enemy.
4. An illegal order means that unit stays put. If a unit staying put makes another order illegal (two friendly units would end on one square), every unit involved stays put. Implement this as a fixed-point resolution.
5. All legal orders execute at the same time. Only final positions matter. Opposing units that swap squares pass through each other without fighting.
6. **Confrontations.** Wherever two opposing units end on the same square:
   - Identical units (same arm and same rank) → both are removed.
   - Any unit vs General → the General is removed.
   - Infantry, Cavalry or Guerrilla vs Artillery → the Artillery is removed.
   - **Forest:** Infantry beats Cavalry and Guerrillas; Guerrillas beat Cavalry.
   - **Open field:** Cavalry beats Infantry and Guerrillas; Guerrillas beat Infantry.
   - Same arm, different rank, on any terrain: 1st beats 2nd, 2nd beats 3rd, 3rd beats 1st.
   - When the arms differ, rank doesn't matter.
   - Artillery vs Artillery counts as identical units, so both are removed.
7. **Artillery fire** happens after confrontations. Every artillery unit that survived step 6 removes all enemy units within its range, **except Guerrillas**. Range depends on the target's elevation relative to the gun and is measured in Manhattan distance:
   - target 2 levels below → range 3
   - 1 level below → range 2
   - same level → range 1
   - above → range 0
8. **Win/draw.** Removing the enemy General wins. If both Generals are removed on the same day, the game is a draw.

**Test cases from the rulebook.** Use these to validate `board.json` once I supply it:
- Gun at A8 removes enemies at A7, A9, A10, B7, B8, B9, B10, C8, C9, D8.
- Gun at G4 removes enemies at E4, F3, F4, G2, G3, H3, H4, I4.
- Gun at F3 removes only an enemy at G3.

**Ambiguities.** Make each of these a configurable house-rule flag with the default shown:
- Guns that are in range of each other in step 7 all fire at once (default: yes, they can destroy each other).
- Cross-arm combat ignores rank (default: yes).

---

## Part 1 — the app

Requirements:
- **Cross-platform with no app stores.** My lean is an installable **PWA**. Push back if you disagree.
- **Asynchronous play.** One player creates a game and shares a link or room code. The other joins. No accounts for now, just a per-game player token.
- **Server-authoritative hidden information.** The server holds each player's deployment and orders. It reveals them only once both players have submitted, then resolves the day. The client never receives the opponent's hidden data.
- **Notify the other player** when it's their move. Use web push, which works for home-screen PWAs on iOS 16.4+, or propose something simpler.
- **One shared rules engine.** It should be a pure, deterministic TypeScript package used by the server, the client (for move previews and legality highlighting) and the Part 2 solver.
- **UI basics:**
  - drag-to-deploy
  - tap a unit, then tap a destination to queue an order, with an orders counter showing n/12
  - reachable squares highlighted
  - a toggleable overlay showing artillery threat zones
  - an animated reveal of each day's resolution
  - a game log
- **Lightweight hosting** that's free or close to it. Candidates are Cloudflare Workers with Durable Objects, or Supabase/Firebase. Recommend one and justify it briefly.

## Part 2 — deployment optimizer

Goal: find strong deployments when I don't know the opponent's deployment.

How I see the problem:
- This is a simultaneous-move, imperfect-information game. Against an unknown opponent, a single "best" deployment is exploitable, so the right output is probably a **robust deployment or a mixed strategy** (a distribution over deployments), not one fixed answer.
- A deployment's value depends on how the rest of the game is played, so we need **play policies** to evaluate deployments.

Suggested approach (refine it as needed):
1. **Bots.** Start with a random-legal bot and a heuristic bot. The heuristic bot should protect its General by keeping enemy units beyond their move range, avoid enemy artillery zones, and pick favorable terrain matchups. Then build a stronger search bot, such as Information Set MCTS or something regret-based. Make the bot interface pluggable.
2. **Cheap static features** for pruning:
   - General exposure: minimum Manhattan distance from the General to enemy Cavalry/Guerrilla reach after N days
   - artillery coverage of approach lanes
   - high-ground use
   - forest/open placement of Infantry vs Cavalry
   - guerrilla screening
3. **Search the deployment space.** Use simulated annealing, a genetic algorithm or similar. Score each deployment by its win rate against a diverse pool of opponent deployments and policies.
4. **Find robust strategies.** Use fictitious play, double oracle or PSRO-style iteration over deployments to approximate an equilibrium mixture. Report:
   - the top robust deployments
   - their worst-case and average win rates
   - the exploitability of the mixture
5. **Output.** Write results as JSON (I'll analyze in Python/Jupyter) and add a viewer page in the app that shows recommended deployments on the board.
6. **Performance.** Run simulations headless in Node with worker threads. If throughput becomes the bottleneck, propose porting the engine core to Rust/WASM, but keep one source of truth for the rules.

## Engineering expectations
- Use a monorepo: `engine/` (pure rules), `server/`, `app/`, `solver/`.
- Give the engine exhaustive unit tests:
  - every confrontation pairing on both terrains
  - artillery ranges at each elevation difference
  - the three rulebook examples
  - swap and jump cases
  - illegal-move cascades
  - simultaneous General kills (draw)
- Use seeded RNG everywhere so results are reproducible.
- Keep it light: few dependencies, and no heavy game frameworks unless justified.

## Phases (check in with me after each)
0. Architecture proposal plus the open questions you need answered.
1. Engine and tests, using the placeholder board.
2. Local hot-seat UI (both sides on one device, with a pass-the-device screen).
3. Online play with hidden orders and notifications, deployed.
4. Bots and a self-play harness.
5. Deployment optimizer and results viewer.
---

## Decisions (Phase 0, 2026-10-08)
- **Coordinates:** the physical board labels **rows A–K** (A = Blue's home edge, K = Red's) and **columns 1–11**. `A8` = row A, column 8.
- **Deployment zone** is jagged and holds exactly 40 squares, so every square is filled. Red (behind the red line, rows K→G): K1–K11, J1–J11, I4–I11, H6–H11, G8–G11 (11/11/8/6/4). Blue is the 180° rotation: A1–A11, B1–B11, C1–C8, D1–D6, E1–E4. Terrain is also 180°-symmetric.
- **Conflicting orders (rulebook footnote 2):** if two orders send units to the same square, or order the same unit twice, both are illegal, *unless only one of them is otherwise legal*, in which case that one executes.
- **Rulebook Sample Day 1** (Blue) is an engine test: E4-G4, D5-F5✗, D4-F5✗, C6-E6, B5-D5✗ (cascade: D5 stays occupied), B8-C9, A7-B8, E2-G2, C2-E2, E3-G3, B10-D10, B11-D11.
- **Simultaneous gunfire is the official rule** (footnote 3): a gun in range of an enemy gun still fires before it is removed.
- **Hidden information** applies only to deployment (day 0). After the day-0 reveal, every unit is visible to both players.
- **Max days:** a configurable option (default: unlimited online; a fixed cap for the solver). Reaching the cap is a draw.
- **Cycles** (A→B, B→C, C→A) are legal. Only final positions matter.
- **Artillery** fires every day, after all orders from both sides are applied and confrontations are resolved. Guns that moved fire too.
- **Guerrilla vs Guerrilla** = identical: both are removed. **Every unit beats the General**, and General vs General removes both (draw).
- **Android:** nice to have.

## Status (2026-10-08)
- Phase 3 deployed at https://field-command.fc-server.workers.dev (push still to be confirmed on real devices).
- Phase 4 (bots + self-play) done.
- **Phase 5 (deployment optimizer + viewer) done and deployed, awaiting review.** First run (`solver/results/optimizer-run1.json`, 10 rounds, ~35 min on 8 cores): exploitability 16.9 → 0–6 points after round 1; recommended mix of 7 layouts; the top 3 put the General on A4/B4 (forest, near the deep right part of the zone) with guns nearby. Gun cover around the General correlates best with score (r 0.61), then bodyguards (0.42). Regret-bot rank check: Spearman 0.54 (moderate agreement).
- **Play the computer** (added after Phase 5): menu card with Easy (`heuristic:noise=3,guard=0`), Medium (`heuristic:noise=0.5`) and Hard (`regret`, which deploys from the published recommended mix). Bots run in a module Web Worker (`app/src/bot/`). It reuses the hot-seat flow with `game.computer = {human, level}` and a `thinking` screen, which resumes after a reload.
- Optimizer details: `npm run optimize -- [--iterations N --publish]`: double oracle over layouts (`solver/src/optimizer/`). A Layout = 40 kind codes on Blue's zone squares in ascending order; Red is the 180° rotation. Each round: regret-matching mixture over the pool, then simulated-annealing best-response chains (one per thread; static features prune bad swaps). Exploitability = best counter's score vs the mix − 50%. Top layouts are re-checked with the regret bot (Spearman rank correlation). Output: `solver/results/*.json`; `--publish` also writes `app/public/results/latest.json`, which the app shows at `/results` and uses for the deploy screen's "Use a recommended setup" (drawn at random by weight).
- Solver: `solver/` (pure TS, Node worker threads). Bots implement `Bot { deploy, orders }` and are built from spec strings via `makeBot("heuristic:aggression=2")`: `random`, `heuristic` (one-day lookahead; params noise/aggression/caution/guard), `regret` (candidate order sets for both sides, payoff by resolve + heuristic rollout, regret matching, samples from the mixture; params candidates/opponentCandidates/depth/iterations). `playGame(blue, red, {seed, maxDays, deployments})` is reproducible from the seed. `npm run tournament -- --bot A --bot B --games N` → table + `solver/results/*.json`.
- Key finding: Generals die early to Cavalry/Guerrilla raids unless they dodge. The General swaps with a neighbour so a bodyguard stands on the targeted square. Every setup square is full, so a swap is usually the only way to move at first. Phase-4 tournament (100 games per pairing): random < heuristic without guard (0%) < heuristic (98% vs no-guard) < regret (82.5% vs heuristic). Blue/Red win counts were balanced.
- Deploy: `npm run deploy` (builds the app, then `wrangler deploy`). Production VAPID keys are Wrangler secrets (separate from `.dev.vars`).
- Server: `server/` = Cloudflare Worker + one SQLite-backed Durable Object per game (`GameRoom`), which also serves `app/dist`. Room rules live in pure `server/src/room.ts` (unit-tested, incl. no hidden-info leaks). The server stores only both sides' orders per day; clients replay them through the engine. A WebSocket pings clients on change. Web push is payload-less (VAPID JWT only), so the service worker shows a fixed "It's your move". Keys: `node server/scripts/vapid-keys.mjs` → `server/.dev.vars` (local, gitignored) / `wrangler secret put` (prod).
- Online identity = per-game token in localStorage, plus a private "player link" (`/g/CODE#t=TOKEN`) to move a seat to another device or to the installed iOS app (separate storage).
- **Player names (2026-10-09):** optional per-game name on each seat (`Seat.name`, cleaned by `cleanName`: whitespace collapsed, control chars stripped, max 24 chars; empty = no name). Set on create/join (`name` in the body) or anytime via `POST /api/games/CODE/name`; renames ping sockets but send no push. `PlayerView` has `myName`/`opponentName`. The client remembers the last-used name (`field-command.name.v1`) and shows names in the sidebar (`Names` in `Online.tsx`), waiting messages and the games list; unnamed players fall back to Blue/Red.
- **Rules summary (2026-10-09):** the main menu (`app/src/screens/Menu.tsx`) opens with a "How to play" card (six steps: deploy, orders, simultaneous moves, clashes, gunfire, win/draw). Combat matchups stay in the Units card further down, which the summary points to.
- **Install card (2026-10-09):** `app/src/components/InstallCard.tsx` sits at the top of the menu. Where Chromium fires `beforeinstallprompt` (captured at startup by `captureInstallPrompt()` in `app/src/install.ts`, which also holds the shared `isIos`/`isStandalone`/`platform` checks) it shows a one-tap install button; otherwise per-device steps (iOS Add to Home Screen, Android menu, Mac Safari File → Add to Dock, desktop Chrome/Edge). Hidden in the installed app or once dismissed (`field-command.install-hidden.v1`). On iOS/Mac Safari with online games on the device, it explains the installed app has separate storage and to move games via the player link. Decision: stay a PWA, no native/store apps (cost and review overhead for a two-player game); PWABuilder is the cheap route if a Play Store listing is ever wanted.
- **Units chart (2026-10-09):** the menu's Units card (`app/src/components/UnitsCard.tsx`) shows the unit table, ranked lines (forest: Infantry › Guerrillas › Cavalry; open: Cavalry › Guerrillas › Infantry; same arm 1st › 2nd › 3rd › 1st), the special cases, a forest/open matchup chart generated from the engine's `combat()` (rows = your unit), and a gunfire note.
- **Orders screen (2026-10-10):** tapping the selected unit again clears its queued order (and deselects). The small "Clear" button (`button.small`) sits right of Submit and clears all orders. A units-left table (`app/src/components/Forces.tsx`) sits between the board and the overlay toggle: one column per kind, your side first; counts turn red after losses and grey at 0.
- **Unit emblems (2026-10-10):** units are drawn as map-symbol glyphs by default (`app/src/components/Emblem.tsx`: ✕ infantry, long left chevron cavalry, dot artillery, star General, zigzag guerrillas; 1–3 pips = rank), bare on the token (framed NATO boxes were rejected as cluttered). Preference Emblems/Letters lives in `app/src/prefs.ts` (`field-command.unit-style.v1`), toggled in the menu's Units card; `TokenMark` (SVG) and `UnitIcon` (HTML) follow it everywhere (board, order chips, deploy tray/ghost, Units card, units-left table). With emblems, the units-left headers add short names (`ABBR` in `labels.ts`) so the table doubles as the key.
- Local full stack: `npm run build && npm run dev:server` → http://localhost:8787. Or `npm run dev` (Vite, proxies /api to 8787) alongside `npm run dev:server`.
- App: `app/` (Vite 7 + Preact, SVG board, no other deps). `npm run dev` serves it on the local network. The hot-seat game is saved in localStorage. Each player sees their own edge at the bottom (Blue: A1 bottom-right).
- Tooling: npm workspaces (no pnpm), Node 25 runs `.ts` directly; tests use `node:test`. `npm test`, `npm run typecheck`, `npm run dev`, `npm run build`. Engine has zero runtime dependencies.
- **`engine/board.json` is the real board**, transcribed from the owner's sketch (`Height:biome.jpg`: number = elevation, g = forest, s = sand/open; G–K = A–E rotated 180°; F2 = 2/open confirmed). It matches the photo `s-l1600 (1).webp`, and all three rulebook artillery examples pass.
- The two house-rule flags were dropped: the rules sheet settles both (simultaneous gunfire, footnote 3; rank only matters within the same arm). The only engine option is `maxDays`.
- Engine speed: ~27k days/s (~430 random games/s) on one core.
