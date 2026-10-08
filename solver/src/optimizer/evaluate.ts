import { createRng } from '@fc/engine';
import { makeBot, type Bot } from '../bots/index.ts';
import { playGame, stream } from '../selfplay.ts';
import { toDeployment, type Layout } from './layout.ts';

/** Play styles used to evaluate layouts; each side draws one per game so no single style decides. */
export const DEFAULT_POLICIES = [
  'heuristic:noise=1',
  'heuristic:noise=1,aggression=2',
  'heuristic:noise=1,caution=2,aggression=0.5',
];

const cache = new Map<string, Bot>();
const bot = (spec: string) => cache.get(spec) ?? cache.set(spec, makeBot(spec)).get(spec)!;

export interface EvalOptions {
  policies: string[];
  maxDays: number;
}

/** One game between two layouts; returns A's score (1 win, 0.5 draw, 0 loss). Colours alternate by seed. */
export function match(a: Layout, b: Layout, seed: number, o: EvalOptions): number {
  const pick = stream(seed, 3);
  const pBlue = o.policies[Math.floor(pick() * o.policies.length)];
  const pRed = o.policies[Math.floor(pick() * o.policies.length)];
  const aBlue = seed % 2 === 0;
  const deployments = aBlue
    ? { blue: toDeployment(a, 'blue'), red: toDeployment(b, 'red') }
    : { blue: toDeployment(b, 'blue'), red: toDeployment(a, 'red') };
  const r = playGame(bot(pBlue), bot(pRed), { seed, maxDays: o.maxDays, deployments });
  if (r.winner === null) return 0.5;
  return (r.winner === 'blue') === aBlue ? 1 : 0;
}

/** A's mean score over `games` games against B. */
export function head2head(a: Layout, b: Layout, games: number, seed: number, o: EvalOptions): number {
  let s = 0;
  for (let g = 0; g < games; g++) s += match(a, b, seed + g, o);
  return s / games;
}

/** A fixed schedule of (opponent, seed) pairs drawn from a mixture, so candidates are compared on the same games. */
export function schedule(weights: number[], games: number, seed: number): { opponent: number; seed: number }[] {
  const rng = createRng(seed);
  return Array.from({ length: games }, (_, g) => {
    let x = rng(), i = 0;
    while (i < weights.length - 1 && (x -= weights[i]) > 0) i++;
    return { opponent: i, seed: seed * 7919 + g };
  });
}

export function scoreAgainst(a: Layout, opponents: Layout[], plan: { opponent: number; seed: number }[], o: EvalOptions): number {
  let s = 0;
  for (const { opponent, seed } of plan) s += match(a, opponents[opponent], seed, o);
  return s / plan.length;
}
