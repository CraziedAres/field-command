import { rotate180, sq, squareName, type Deployment, type Side } from '@fc/engine';

/** The parts of the optimizer's JSON output that the app uses (see solver/src/cli/optimize.ts). */
export interface LayoutStats {
  id: string;
  origin: string;
  weight: number;
  averageScore: number;
  worstScore: number;
  worstOpponent: string;
  scoreVsMixture: number;
  features: Record<string, number>;
  /** In Blue's frame. */
  deployment: Deployment;
}

export interface OptimizerResults {
  generated: string;
  seconds: number;
  config: { iterations: number; matrixGames: number; games: number; steps: number; policies: string[] };
  iterations: { iteration: number; poolSize: number; exploitability: number; bestResponse: string }[];
  recommended: string[];
  layouts: LayoutStats[];
  validation: { policy: string; layouts: string[]; heuristicPolicyAverage: number[]; regretPolicyAverage: number[]; rankCorrelation: number; gamesPerPair: number };
}

export async function loadResults(url = '/results/latest.json'): Promise<OptimizerResults | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? ((await res.json()) as OptimizerResults) : null;
  } catch {
    return null;
  }
}

/** A Blue-frame deployment placed for either side (Red's zone is Blue's turned 180°). */
export function forSide(blueFrame: Deployment, side: Side): Deployment {
  if (side === 'blue') return { ...blueFrame };
  return Object.fromEntries(Object.entries(blueFrame).map(([name, k]) => [squareName(rotate180(sq(name))), k]));
}

/** Draw one recommended layout with the mixture's probabilities. */
export function drawFromMix(r: OptimizerResults, rand = Math.random): LayoutStats {
  const recs = r.recommended.map((id) => r.layouts.find((l) => l.id === id)!).filter(Boolean);
  const total = recs.reduce((s, l) => s + l.weight, 0);
  let x = rand() * total;
  for (const l of recs) if ((x -= l.weight) <= 0) return l;
  return recs[recs.length - 1];
}
