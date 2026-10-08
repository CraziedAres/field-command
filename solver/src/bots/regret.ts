/**
 * Search bot for the simultaneous-move game. Each day it:
 *  1. generates candidate order sets for itself and for the opponent (heuristic orders at several noise
 *     levels and aggression settings, plus "hold");
 *  2. scores every pair by resolving the day and playing `depth` more days of plain heuristic play,
 *     then evaluating the position;
 *  3. solves that payoff matrix approximately with regret matching (both players);
 *  4. samples its orders from its equilibrium mixture, so it can't be read and exploited.
 * After deployment the board is fully visible, so no information-set sampling is needed.
 */
import { opponent, resolveDay, type GameState, type Order, type Rng, type Side } from '@fc/engine';
import { evaluate } from './features.ts';
import { heuristicDeployment, heuristicOrders, type HeuristicParams } from './heuristic.ts';
import type { Bot } from './types.ts';

export interface RegretParams {
  /** Candidate order sets for this side. */
  candidates: number;
  /** Candidate order sets assumed for the opponent. */
  opponentCandidates: number;
  /** Extra days of heuristic play after the candidate day before evaluating. */
  depth: number;
  /** Regret-matching iterations. */
  iterations: number;
  /** Maximum days in a rollout's game (keeps rollouts consistent with the game's own limit). */
  maxDays?: number;
}

export const DEFAULT_REGRET: RegretParams = { candidates: 8, opponentCandidates: 8, depth: 1, iterations: 300 };

const VARIANTS: Partial<HeuristicParams>[] = [
  { noise: 0 },
  { noise: 0, guard: 0 },
  { noise: 0, aggression: 2 },
  { noise: 0, caution: 2, aggression: 0.5 },
  { noise: 1 },
  { noise: 2, aggression: 1.5 },
  { noise: 3 },
];

function candidateOrders(state: GameState, side: Side, rng: Rng, n: number): Order[][] {
  const out: Order[][] = [[]]; // holding still is always an option
  const seen = new Set(['[]']);
  for (let i = 0; out.length < n && i < n * 3; i++) {
    const v = VARIANTS[i % VARIANTS.length];
    // Past the first round of variants, add extra noise so later candidates differ.
    const extra = i >= VARIANTS.length ? 1.5 : 0;
    const orders = heuristicOrders(state, side, rng, { aggression: 1, caution: 1, guard: 1, ...v, noise: (v.noise ?? 0) + extra });
    const key = JSON.stringify(orders);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(orders);
    }
  }
  return out;
}

/** Value in (-1, 1) for `side` after the candidate day plus a short heuristic rollout. */
function payoff(state: GameState, side: Side, mine: Order[], theirs: Order[], rng: Rng, p: RegretParams): number {
  const foe = opponent(side);
  let s = resolveDay(state, side === 'blue' ? { blue: mine, red: theirs } : { blue: theirs, red: mine }, { maxDays: p.maxDays }).state;
  for (let d = 0; d < p.depth && !s.result; d++) {
    const a = heuristicOrders(s, side, rng), b = heuristicOrders(s, foe, rng);
    s = resolveDay(s, side === 'blue' ? { blue: a, red: b } : { blue: b, red: a }, { maxDays: p.maxDays }).state;
  }
  const v = evaluate(s, side);
  return v / (Math.abs(v) + 30);
}

/** Regret matching on a zero-sum matrix game; returns the row player's average strategy. */
export function solveMatrix(u: number[][], iterations: number): number[] {
  const n = u.length, m = u[0].length;
  const r1 = new Float64Array(n), r2 = new Float64Array(m), avg = new Float64Array(n);
  const strategy = (r: Float64Array) => {
    let total = 0;
    for (const x of r) total += Math.max(x, 0);
    return Array.from(r, (x) => (total > 0 ? Math.max(x, 0) / total : 1 / r.length));
  };
  for (let t = 0; t < iterations; t++) {
    const s1 = strategy(r1), s2 = strategy(r2);
    const v1 = u.map((row) => row.reduce((acc, x, j) => acc + x * s2[j], 0));
    const v2 = Array.from({ length: m }, (_, j) => -u.reduce((acc, row, i) => acc + row[j] * s1[i], 0));
    const e1 = v1.reduce((a, x, i) => a + x * s1[i], 0), e2 = v2.reduce((a, x, j) => a + x * s2[j], 0);
    for (let i = 0; i < n; i++) r1[i] += v1[i] - e1;
    for (let j = 0; j < m; j++) r2[j] += v2[j] - e2;
    for (let i = 0; i < n; i++) avg[i] += s1[i];
  }
  return Array.from(avg, (x) => x / iterations);
}

export function regretBot(params: Partial<RegretParams> = {}, name = 'regret'): Bot {
  const p = { ...DEFAULT_REGRET, ...params };
  return {
    name,
    deploy: (side, rng) => heuristicDeployment(side, rng),
    orders(state, side, rng) {
      const mine = candidateOrders(state, side, rng, p.candidates);
      const theirs = candidateOrders(state, opponent(side), rng, p.opponentCandidates);
      const u = mine.map((a) => theirs.map((b) => payoff(state, side, a, b, rng, p)));
      const mix = solveMatrix(u, p.iterations);
      let x = rng();
      for (let i = 0; i < mix.length; i++) if ((x -= mix[i]) <= 0) return mine[i];
      return mine[mix.length - 1];
    },
  };
}
