import type { Deployment, Order, SerializedState, Side } from '@fc/engine';
import { drawFromMix, forSide, loadResults } from '../results.ts';
import type { BotRequest, BotTask } from './worker.ts';

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: Record<Level, { label: string; spec: string; blurb: string }> = {
  easy: { label: 'Easy', spec: 'heuristic:noise=3,guard=0', blurb: 'Erratic, and careless with its General.' },
  medium: { label: 'Medium', spec: 'heuristic:noise=0.5', blurb: 'Sensible one-day lookahead; guards its General.' },
  hard: {
    label: 'Hard', spec: 'regret',
    blurb: 'Searches both sides’ options each day and mixes its plans so it can’t be read. Deploys from the recommended setups.',
  },
};

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();

function call<T>(req: BotTask): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const w = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      if (e.data.error !== undefined) w?.reject(new Error(e.data.error));
      else w?.resolve(e.data.result);
    };
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (r: unknown) => void, reject });
    worker!.postMessage({ ...req, id } as BotRequest);
  });
}

const seed = () => (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
/** Keep "thinking" on screen briefly even when the bot is instant, so the hand-off is visible. */
const atLeast = async <T>(ms: number, p: Promise<T>): Promise<T> => (await Promise.all([p, new Promise((r) => setTimeout(r, ms))]))[0];

export async function computerDeployment(level: Level, side: Side): Promise<Deployment> {
  if (level === 'hard') {
    const results = await loadResults();
    if (results?.recommended.length) return atLeast(600, Promise.resolve(forSide(drawFromMix(results).deployment, side)));
  }
  return atLeast(400, call<Deployment>({ type: 'deploy', spec: LEVELS[level].spec, side, seed: seed() }));
}

export function computerOrders(level: Level, state: SerializedState, side: Side): Promise<Order[]> {
  return atLeast(700, call<Order[]>({ type: 'orders', spec: LEVELS[level].spec, side, seed: seed(), state }));
}
