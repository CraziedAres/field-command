/**
 * Deployment optimizer: double oracle (PSRO) over layouts.
 *
 *   1. Start from a small pool of rule-of-thumb and random layouts; play every pair (both colours).
 *   2. Solve the pool's payoff matrix for the equilibrium mixture (regret matching).
 *   3. Search (simulated annealing, several chains in parallel) for the layout that best beats that mixture.
 *      How much it beats the mixture is the exploitability estimate.
 *   4. Add it to the pool and repeat.
 *   5. Re-test the top layouts with a different, stronger play policy (the regret bot) to see whether the
 *      ranking depends on the policy used.
 *
 *   npm run optimize -- --iterations 8 --publish
 *
 * Options: --iterations N (6) --chains N (threads) --steps N (200) --games N per search evaluation (32)
 * --matrix-games N per pair (40) --validate-games N per pair (12) --validate-top N (5) --seed S (1)
 * --threads T --max-days D (100) --out FILE --publish (copy to app/public/results/latest.json)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createRng } from '@fc/engine';
import { solveMatrix } from '../bots/regret.ts';
import type { BestResponse } from '../optimizer/bestResponse.ts';
import { DEFAULT_POLICIES, type EvalOptions } from '../optimizer/evaluate.ts';
import { features } from '../optimizer/features.ts';
import { heuristicLayout, layoutKey, randomLayout, toDeployment, type Layout } from '../optimizer/layout.ts';
import { Pool } from '../optimizer/pool.ts';
import type { Task } from '../optimizer/worker.ts';

const { values: v } = parseArgs({
  options: {
    iterations: { type: 'string', default: '6' },
    chains: { type: 'string' },
    steps: { type: 'string', default: '200' },
    games: { type: 'string', default: '32' },
    'matrix-games': { type: 'string', default: '40' },
    'validate-games': { type: 'string', default: '12' },
    'validate-top': { type: 'string', default: '5' },
    seed: { type: 'string', default: '1' },
    threads: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
    'max-days': { type: 'string', default: '100' },
    out: { type: 'string' },
    publish: { type: 'boolean', default: false },
  },
});
const threads = Number(v.threads), seed = Number(v.seed);
const cfg = {
  iterations: Number(v.iterations), chains: Number(v.chains ?? threads), steps: Number(v.steps), games: Number(v.games),
  matrixGames: Number(v['matrix-games']), validateGames: Number(v['validate-games']), validateTop: Number(v['validate-top']),
  seed, maxDays: Number(v['max-days']), policies: DEFAULT_POLICIES,
};
const evalOpts: EvalOptions = { policies: cfg.policies, maxDays: cfg.maxDays };
const pool = new Pool<Task, number | BestResponse>(new URL('../optimizer/worker.ts', import.meta.url), threads);
const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] ${msg}`);

interface Member { id: string; origin: string; layout: Layout }
const members: Member[] = [];
const M: number[][] = []; // M[i][j] = i's score against j

async function addMembers(fresh: Member[]) {
  const start = members.length;
  members.push(...fresh);
  const tasks: Task[] = [], cells: [number, number][] = [];
  for (let i = start; i < members.length; i++) {
    M[i] = M[i] ?? [];
    M[i][i] = 0.5;
    for (let j = 0; j < i; j++) {
      cells.push([i, j]);
      tasks.push({ type: 'h2h', a: members[i].layout, b: members[j].layout, games: cfg.matrixGames, seed: seed * 1_000_000 + i * 1000 + j * 7, eval: evalOpts });
    }
  }
  const scores = (await pool.run(tasks)) as number[];
  cells.forEach(([i, j], k) => {
    M[i][j] = scores[k];
    M[j][i] = 1 - scores[k];
  });
}

const mixture = () => solveMatrix(M.map((row) => row.map((x) => x - 0.5)), 20000);

// 1. Initial pool: rule-of-thumb layouts (with variety) and a few random ones.
const rng = createRng(seed);
const initial: Member[] = [
  { id: 'heuristic-0', origin: 'heuristic (no noise)', layout: heuristicLayout(rng, 0) },
  ...Array.from({ length: 5 }, (_, i) => ({ id: `heuristic-${i + 1}`, origin: 'heuristic', layout: heuristicLayout(rng, 1.5) })),
  ...Array.from({ length: 2 }, (_, i) => ({ id: `random-${i + 1}`, origin: 'random', layout: randomLayout(rng) })),
];
log(`Initial pool of ${initial.length} layouts; ${(initial.length * (initial.length - 1)) / 2 * cfg.matrixGames} games…`);
await addMembers(initial);

// 2–4. Double oracle.
const iterations: { iteration: number; poolSize: number; exploitability: number; bestResponse: string; evaluated: number; pruned: number }[] = [];
for (let it = 1; it <= cfg.iterations; it++) {
  const sigma = mixture();
  const tasks: Task[] = Array.from({ length: cfg.chains }, (_, c) => ({
    type: 'br', opponents: members.map((m) => m.layout), weights: sigma,
    options: { ...evalOpts, steps: cfg.steps, games: cfg.games, seed: seed * 10_000 + it * 100 + c, pruneMargin: 1.5 },
  }));
  const results = (await pool.run(tasks)) as BestResponse[];
  const best = results.reduce((a, b) => (b.score > a.score ? b : a));
  const exploitability = best.score - 0.5;
  const id = `search-${it}`;
  iterations.push({
    iteration: it, poolSize: members.length, exploitability, bestResponse: id,
    evaluated: results.reduce((s, r) => s + r.evaluated, 0), pruned: results.reduce((s, r) => s + r.pruned, 0),
  });
  log(`Iteration ${it}: best counter-layout scores ${(100 * best.score).toFixed(1)}% against the mix (exploitability ${(100 * exploitability).toFixed(1)} pts)`);
  if (members.some((m) => layoutKey(m.layout) === layoutKey(best.layout))) {
    log('  …it is already in the pool; stopping early.');
    break;
  }
  await addMembers([{ id, origin: `best response, iteration ${it}`, layout: best.layout }]);
}

// Final mixture and per-layout statistics.
const sigma = mixture();
const stats = members.map((m, i) => {
  const others = M[i].map((s, j) => ({ s, j })).filter(({ j }) => j !== i);
  const worst = others.reduce((a, b) => (b.s < a.s ? b : a));
  return {
    id: m.id, origin: m.origin, weight: sigma[i],
    averageScore: others.reduce((a, b) => a + b.s, 0) / others.length,
    worstScore: worst.s, worstOpponent: members[worst.j].id,
    scoreVsMixture: M[i].reduce((a, s, j) => a + s * sigma[j], 0),
    features: features(m.layout),
    deployment: toDeployment(m.layout, 'blue'),
  };
});
const recommended = stats.filter((s) => s.weight >= 0.01).sort((a, b) => b.weight - a.weight);

// 5. Policy check: replay the top layouts (plus the plain rule-of-thumb layout) with the regret bot.
const check = [...recommended.slice(0, cfg.validateTop).map((s) => s.id)];
if (!check.includes('heuristic-0')) check.push('heuristic-0');
const checkLayouts = check.map((id) => members.find((m) => m.id === id)!.layout);
const regretOpts: EvalOptions = { policies: ['regret'], maxDays: cfg.maxDays };
log(`Policy check: ${check.length} layouts round-robin with the regret bot…`);
const pairs: [number, number][] = [];
for (let i = 0; i < check.length; i++) for (let j = i + 1; j < check.length; j++) pairs.push([i, j]);
const regretScores = (await pool.run(pairs.map(([i, j]) => ({
  type: 'h2h' as const, a: checkLayouts[i], b: checkLayouts[j], games: cfg.validateGames, seed: seed * 3_000_000 + i * 100 + j, eval: regretOpts,
})))) as number[];
const R = check.map(() => check.map(() => 0.5));
pairs.forEach(([i, j], k) => {
  R[i][j] = regretScores[k];
  R[j][i] = 1 - regretScores[k];
});
const idx = check.map((id) => members.findIndex((m) => m.id === id));
const avg = (row: number[], self: number) => row.filter((_, j) => j !== self).reduce((a, b) => a + b, 0) / (row.length - 1);
const heuristicAvg = idx.map((i, a) => avg(idx.map((j) => M[i][j]), a));
const regretAvg = R.map((row, a) => avg(row, a));
const rank = (xs: number[]) => xs.map((x) => xs.filter((y) => y > x).length + (xs.filter((y) => y === x).length - 1) / 2);
const spearman = (() => {
  const a = rank(heuristicAvg), b = rank(regretAvg), n = a.length;
  return 1 - (6 * a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0)) / (n * (n * n - 1));
})();
const validation = {
  policy: 'regret', gamesPerPair: cfg.validateGames, layouts: check,
  heuristicPolicyAverage: heuristicAvg, regretPolicyAverage: regretAvg, matrix: R, rankCorrelation: spearman,
};
pool.close();

// Report.
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log('\nRecommended mix (play each layout with this probability):');
console.log('  layout          weight   avg score  worst case (vs)            vs mix   General  bodyguards  raid days');
for (const s of recommended) {
  console.log(
    `  ${s.id.padEnd(15)} ${pct(s.weight).padStart(6)}   ${pct(s.averageScore).padStart(7)}    ${`${pct(s.worstScore)} (${s.worstOpponent})`.padEnd(26)} ${pct(s.scoreVsMixture).padStart(6)}   ` +
    `${Object.entries(s.deployment).find(([, k]) => k === 'GEN')![0].padEnd(8)} ${String(s.features.generalBodyguards).padEnd(11)} ${s.features.generalRaidDays}`,
  );
}
console.log(`\nExploitability by iteration: ${iterations.map((x) => (100 * x.exploitability).toFixed(1)).join(', ')} (points above 50%)`);
console.log(`Policy check (regret bot): rank correlation with the heuristic-policy ranking = ${spearman.toFixed(2)}`);
check.forEach((id, i) => console.log(`  ${id.padEnd(15)} heuristic policy ${pct(heuristicAvg[i])}   regret policy ${pct(regretAvg[i])}`));

const result = {
  generated: new Date().toISOString(), config: cfg, seconds: (Date.now() - started) / 1000,
  iterations, recommended: recommended.map((s) => s.id), layouts: stats, matrix: M, validation,
};
const out = resolve(v.out ?? `results/optimizer-${result.generated.replace(/[:.]/g, '-')}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`\nResults: ${out}`);
if (v.publish) {
  const pub = fileURLToPath(new URL('../../../app/public/results/latest.json', import.meta.url));
  mkdirSync(dirname(pub), { recursive: true });
  writeFileSync(pub, JSON.stringify(result));
  console.log(`Published for the app viewer: ${pub}`);
}
