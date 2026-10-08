import { heuristicBot, type HeuristicParams } from './heuristic.ts';
import { randomBot } from './random.ts';
import { regretBot, type RegretParams } from './regret.ts';
import type { Bot } from './types.ts';

export type { Bot } from './types.ts';
export * from './features.ts';
export { heuristicBot, heuristicDeployment, heuristicOrders } from './heuristic.ts';
export { randomBot } from './random.ts';
export { regretBot, solveMatrix } from './regret.ts';

/**
 * Build a bot from a spec such as "random", "heuristic", "heuristic:aggression=2,noise=0.5" or
 * "regret:depth=2,candidates=10". The spec string is also the bot's name in results.
 */
export function makeBot(spec: string): Bot {
  const [kind, args = ''] = spec.split(':');
  const params: Record<string, number> = {};
  for (const kv of args.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (v === undefined || Number.isNaN(Number(v))) throw new Error(`Bad bot parameter "${kv}" in "${spec}"`);
    params[k] = Number(v);
  }
  switch (kind) {
    case 'random':
      return randomBot;
    case 'heuristic':
      return heuristicBot(params as Partial<HeuristicParams>, spec);
    case 'regret':
      return regretBot(params as Partial<RegretParams>, spec);
    default:
      throw new Error(`Unknown bot "${kind}" (try random, heuristic, regret)`);
  }
}
