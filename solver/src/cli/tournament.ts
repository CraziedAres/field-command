/**
 * Round-robin between bots. Every pairing plays each seed twice, once from each side, so side advantage
 * cancels out. Results go to stdout as a table and to a JSON file for analysis.
 *
 *   npm run tournament -- --bot random --bot heuristic --bot regret --games 50
 *
 * Options: --bot SPEC (repeat; e.g. "heuristic:aggression=2"), --games N per pairing and side (default 20),
 * --seed S (default 1), --threads T (default: CPU cores - 1), --max-days D (default 100), --out FILE.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { makeBot } from '../bots/index.ts';
import type { GameRecord } from '../selfplay.ts';
import type { Job } from './worker.ts';

const { values } = parseArgs({
  options: {
    bot: { type: 'string', multiple: true },
    games: { type: 'string', default: '20' },
    seed: { type: 'string', default: '1' },
    threads: { type: 'string', default: String(Math.max(1, availableParallelism() - 1)) },
    'max-days': { type: 'string', default: '100' },
    out: { type: 'string' },
  },
});
const specs = values.bot ?? ['random', 'heuristic', 'regret'];
specs.forEach(makeBot); // fail fast on a bad spec
const games = Number(values.games), seed = Number(values.seed), maxDays = Number(values['max-days']);
const threads = Math.max(1, Math.min(Number(values.threads), 64));

const jobs: Job[] = [];
for (let i = 0; i < specs.length; i++)
  for (let j = i + 1; j < specs.length; j++)
    for (let g = 0; g < games; g++) {
      jobs.push({ blue: specs[i], red: specs[j], seed: seed + g, maxDays });
      jobs.push({ blue: specs[j], red: specs[i], seed: seed + g, maxDays });
    }

const started = Date.now();
const records: GameRecord[] = [];
await new Promise<void>((done) => {
  let next = 0, finished = 0, lastReport = 0;
  const workerUrl = new URL('./worker.ts', import.meta.url);
  for (let t = 0; t < Math.min(threads, jobs.length); t++) {
    const w = new Worker(workerUrl);
    const feed = () => w.postMessage(next < jobs.length ? jobs[next++] : null);
    w.on('message', (r: GameRecord) => {
      records.push(r);
      finished++;
      if (finished === jobs.length) done();
      if (Date.now() - lastReport > 2000) {
        lastReport = Date.now();
        process.stderr.write(`  ${finished}/${jobs.length} games\r`);
      }
      feed();
    });
    w.on('error', (e) => {
      console.error(e);
      process.exit(1);
    });
    feed();
  }
});

// Summary per pairing, from the first bot's point of view.
const summary = [];
for (let i = 0; i < specs.length; i++)
  for (let j = i + 1; j < specs.length; j++) {
    const [a, b] = [specs[i], specs[j]];
    const rs = records.filter((r) => (r.blue === a && r.red === b) || (r.blue === b && r.red === a));
    const winsA = rs.filter((r) => r.winner && r[r.winner] === a).length;
    const winsB = rs.filter((r) => r.winner && r[r.winner] === b).length;
    const draws = rs.length - winsA - winsB;
    const score = (winsA + draws / 2) / rs.length;
    const ci = 1.96 * Math.sqrt((score * (1 - score)) / rs.length);
    const avgDays = rs.reduce((s, r) => s + r.days, 0) / rs.length;
    summary.push({ a, b, games: rs.length, winsA, winsB, draws, scoreA: score, ci95: ci, avgDays });
  }
const sideWins = { blue: records.filter((r) => r.winner === 'blue').length, red: records.filter((r) => r.winner === 'red').length };

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(`\n${records.length} games in ${((Date.now() - started) / 1000).toFixed(1)}s on ${threads} threads (max ${maxDays} days)\n`);
console.log(`${pad('A', 28)}${pad('B', 28)}${pad('A wins', 8)}${pad('B wins', 8)}${pad('draws', 7)}${pad('A score', 18)}avg days`);
for (const s of summary) {
  console.log(
    `${pad(s.a, 28)}${pad(s.b, 28)}${pad(s.winsA, 8)}${pad(s.winsB, 8)}${pad(s.draws, 7)}` +
    `${pad(`${(100 * s.scoreA).toFixed(1)}% ±${(100 * s.ci95).toFixed(1)}`, 18)}${s.avgDays.toFixed(1)}`,
  );
}
console.log(`\nSide results: Blue won ${sideWins.blue}, Red won ${sideWins.red}, ${records.length - sideWins.blue - sideWins.red} draws`);

const out = resolve(values.out ?? `results/tournament-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ config: { specs, games, seed, maxDays }, summary, sideWins, records }, null, 1));
console.log(`Results: ${out}`);
