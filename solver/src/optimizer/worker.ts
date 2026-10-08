import { parentPort } from 'node:worker_threads';
import { bestResponse, type BestResponseOptions } from './bestResponse.ts';
import { head2head, type EvalOptions } from './evaluate.ts';
import type { Layout } from './layout.ts';

export type Task =
  | { type: 'h2h'; a: Layout; b: Layout; games: number; seed: number; eval: EvalOptions }
  | { type: 'br'; opponents: Layout[]; weights: number[]; options: BestResponseOptions };

parentPort!.on('message', ({ id, task }: { id: number; task: Task }) => {
  const result = task.type === 'h2h'
    ? head2head(task.a, task.b, task.games, task.seed, task.eval)
    : bestResponse(task.opponents, task.weights, task.options);
  parentPort!.postMessage({ id, result });
});
