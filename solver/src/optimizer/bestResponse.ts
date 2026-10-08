import { createRng } from '@fc/engine';
import { scoreAgainst, schedule, type EvalOptions } from './evaluate.ts';
import { features, staticScore } from './features.ts';
import { heuristicLayout, mutate, type Layout } from './layout.ts';

export interface BestResponseOptions extends EvalOptions {
  steps: number;
  games: number;
  seed: number;
  /** Skip a move whose static score drops by more than this without simulating it. */
  pruneMargin: number;
}

export interface BestResponse {
  layout: Layout;
  /** Score against the mixture on fresh games (unbiased by the search's own noise). */
  score: number;
  searchScore: number;
  evaluated: number;
  pruned: number;
}

/**
 * Simulated annealing over unit swaps for the layout that scores best against a mixture of opponent
 * layouts. Candidates are compared on one fixed schedule of games (common random numbers), and the
 * winner is re-scored on new games, since the best of many noisy scores is biased upwards.
 */
export function bestResponse(opponents: Layout[], weights: number[], o: BestResponseOptions): BestResponse {
  const rng = createRng(o.seed);
  const plan = schedule(weights, o.games, o.seed);
  const fitness = (l: Layout) => scoreAgainst(l, opponents, plan, o);

  let current = heuristicLayout(rng);
  let fCurrent = fitness(current);
  for (let i = 0; i < 3; i++) {
    const start = heuristicLayout(rng);
    const f = fitness(start);
    if (f > fCurrent) [current, fCurrent] = [start, f];
  }
  let best = current, fBest = fCurrent, evaluated = 4, pruned = 0;
  let sCurrent = staticScore(features(current));

  for (let step = 0; step < o.steps; step++) {
    const temperature = 0.04 * (1 - step / o.steps) + 0.004;
    const candidate = mutate(current, rng);
    const sCandidate = staticScore(features(candidate));
    if (sCandidate < sCurrent - o.pruneMargin) {
      pruned++;
      continue;
    }
    const f = fitness(candidate);
    evaluated++;
    if (f >= fCurrent || rng() < Math.exp((f - fCurrent) / temperature)) {
      [current, fCurrent, sCurrent] = [candidate, f, sCandidate];
      if (f > fBest) [best, fBest] = [candidate, f];
    }
  }
  const fresh = schedule(weights, o.games * 2, o.seed + 1_000_003);
  return { layout: best, score: scoreAgainst(best, opponents, fresh, o), searchScore: fBest, evaluated, pruned };
}
