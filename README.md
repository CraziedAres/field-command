# Field Command

A digital version of **Field Command** (Walter E. Johnston IV, 1991), a two-player Napoleonic strategy game in which
both sides write their orders in secret and move at the same time. The first player to remove the enemy General wins.

This is a personal project. It uses original, generic art and no box art.

**Play it:** https://field-command.fc-server.workers.dev. It installs as an app on iPhone, Mac and Android: on iPhone,
Share → Add to Home Screen.

## What's here

| Package | What it is |
|---|---|
| [`engine/`](engine) | The rules as a pure, deterministic TypeScript library with no runtime dependencies. The app, the server and the solver all use it. |
| [`app/`](app) | The installable web app (Vite + Preact, SVG board): hot-seat, online, play against the computer, and a viewer for recommended setups. |
| [`server/`](server) | A Cloudflare Worker that serves the app, with one Durable Object per online game. It holds each player's setup and orders in secret until both are in. |
| [`solver/`](solver) | Bots, a bot-vs-bot tournament runner, and the deployment optimizer. |

[`claude.md`](claude.md) holds the full brief, the rules decisions taken while reading the rulebook, and project status.

## The game in brief

- **Board:** 11×11. Rows A–K (Blue's home edge is A, Red's is K), columns 1–11. Every square is forest or open field,
  at elevation 1, 2 or 3. The real board is in [`engine/board.json`](engine/board.json); it is symmetric under a 180° turn.
- **Armies:** 40 units each. Each side sets up secretly on its own 40 squares (rows of 11/11/8/6/4), so every square
  is filled.

  | Unit | Count | Move per day |
  |---|---|---|
  | General | 1 | 1 |
  | Artillery | 5 | 1 |
  | Infantry, 1st / 2nd / 3rd rank | 3 / 10 / 4 | 2 |
  | Cavalry, 1st / 2nd / 3rd rank | 2 / 7 / 3 | 3 |
  | Guerrillas | 5 | 3 |

- **Each day:**
  1. Both players write up to 12 orders (`from → to`). Distance counts orthogonally, so a diagonal step costs 2.
  2. All orders execute at once. Units jump over anything, and only final positions matter. An illegal order means
     that unit stays put, which can cancel other orders in a chain.
- **Clashes.** Where opposing units end on the same square:
  - Every unit beats the General.
  - Infantry, Cavalry and Guerrillas beat Artillery.
  - In forest: Infantry beats Cavalry and Guerrillas, and Guerrillas beat Cavalry.
  - In the open: Cavalry beats Infantry and Guerrillas, and Guerrillas beat Infantry.
  - Within an arm: 1st beats 2nd, 2nd beats 3rd, 3rd beats 1st.
  - Identical units remove each other.
- **Artillery** then fires: every surviving gun removes every enemy unit in range except Guerrillas. Range is 3, 2,
  1 or 0 squares when the target is two levels below, one below, level, or above.
- **Winning:** removing the enemy General wins. Both Generals falling on the same day is a draw.

## Running it

Requires Node 23.6 or later (developed on Node 25), which runs TypeScript directly, so the engine, server and solver
need no build step.

```sh
npm install
npm test            # all unit tests (engine, server rooms, bots, optimizer)
npm run typecheck
npm run dev         # the app on http://localhost:5173 (also on your local network, for testing on a phone)
```

Hot-seat play and play against the computer work with `npm run dev` alone. For online play you also need the server:

```sh
node server/scripts/vapid-keys.mjs > server/.dev.vars   # push-notification keys for local use (gitignored)
npm run dev:server                                       # Worker + Durable Objects on http://localhost:8787
```

`npm run dev` forwards `/api` to that server. To run the production setup locally instead, run `npm run build`, then
`npm run dev:server`, and open http://localhost:8787.

### Deploying

```sh
npx wrangler login
npm run deploy      # builds the app, then deploys the Worker and its static files
```

The first time, give the deployed Worker its own push-notification keys:

```sh
node server/scripts/vapid-keys.mjs                      # prints both values
cd server
npx wrangler secret put VAPID_PUBLIC_KEY                # paste the public key
npx wrangler secret put VAPID_PRIVATE_JWK               # paste the private JWK
```

## Online play

- One player creates a game and sends the link or 6-character code. The other opens it and joins. There are no
  accounts: each seat has a private token, stored on the device.
- **Play on another device** gives you a private link to your seat. On iPhone, paste it into the installed app's
  **Open a game** box: the home-screen app keeps its storage separate from Safari.
- The server stores only the two setups and each day's orders, and reveals them once both players have submitted.
  Clients rebuild the board by replaying those orders through the engine. Tests check that neither player ever
  receives the other's setup or pending orders early.
- Open games update live over a WebSocket. Web push sends "It's your move". On iPhone, notifications only work from
  the installed home-screen app (iOS 16.4 or later).

## Bots and tournaments

All bots implement `Bot { deploy(side, rng), orders(state, side, rng) }` and are built from spec strings:

| Spec | Plays |
|---|---|
| `random` | Random setup and random in-range orders. |
| `heuristic` | One day of lookahead. It scores each square a unit can reach by the risk from enemy units and guns there, attacks it can win, gun targets, and pressure on the enemy General. When raiders can reach its General, it swaps him with a neighbour so that a bodyguard stands on the targeted square. Options: `noise`, `aggression`, `caution`, `guard`. |
| `regret` | Each day it drafts candidate order sets for both sides, scores every pairing with a short playout, solves that payoff table by regret matching, and picks its orders at random from the solution, so it can't be predicted. Options: `candidates`, `opponentCandidates`, `depth`, `iterations`. |

```sh
npm run tournament -- --bot random --bot heuristic --bot regret --games 50
```

Each pairing plays every seed from both sides. The runner prints a table and writes all games to
`solver/results/tournament-*.json`. Every game can be replayed from its seed.

The in-app computer opponent uses these bots: Easy is `heuristic:noise=3,guard=0`, Medium is
`heuristic:noise=0.5`, and Hard is `regret`, which sets up from the recommended mix.

## Deployment optimizer

```sh
npm run optimize -- --iterations 10 --publish
```

A setup that is best against one known opponent can be countered, so the optimizer looks for a **mix** of setups,
using the double-oracle method:

1. Start from a pool of rule-of-thumb and random setups, and play every pair with varied heuristic play styles,
   from both sides.
2. Solve the pool's results table for the equilibrium mix (regret matching).
3. Search with simulated annealing, swapping pairs of units, for the setup that best beats that mix. Searches run on
   all cores. How much it beats the mix is the **exploitability** estimate: 0 points would mean nothing beats the mix.
4. Add that setup to the pool and repeat.
5. Replay the top setups with the `regret` bot, to see whether the ranking depends on the bot that played them.

`--publish` copies the result to `app/public/results/latest.json`. The app shows it at
[`/results`](https://field-command.fc-server.workers.dev/results), and the deploy screen's **Use a recommended setup**
button draws from the mix.

**Output** (`solver/results/optimizer-*.json`):

- `layouts`: every setup, with its mix weight, average and worst-case scores, rule-of-thumb features, and its
  placement in Blue's frame
- `matrix`: every setup's score against every other
- `iterations`: exploitability by round
- `validation`: the regret-bot check

All of it loads directly into pandas.

**First run** (10 rounds; about 35 minutes on 8 cores):

- The recommended mix holds 7 setups.
- The top three put the General on **A4 or B4**. Both are forest squares, where Infantry bodyguards beat both
  Cavalry and Guerrillas, and he has guns nearby.
- Gun cover around the General goes with winning more than any other rule-of-thumb feature (r = 0.61).
- After the first round, the best counter-setup found gained only 0–12 points against the mix.
- The regret-bot replay only partly agreed with the ranking (rank correlation 0.54). Treat the General-placement
  pattern as the solid finding and the exact weights as tentative.
