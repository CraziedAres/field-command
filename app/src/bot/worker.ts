/** Runs the computer player off the main thread so the page stays responsive while it thinks. */
import { createRng, deserializeState, type SerializedState, type Side } from '@fc/engine';
import { makeBot } from '@fc/solver';

export type BotTask =
  | { type: 'deploy'; spec: string; side: Side; seed: number }
  | { type: 'orders'; spec: string; side: Side; seed: number; state: SerializedState };
export type BotRequest = BotTask & { id: number };

const post = (self as unknown as { postMessage(message: unknown): void }).postMessage.bind(self);

self.onmessage = (e: MessageEvent<BotRequest>) => {
  const req = e.data;
  try {
    const bot = makeBot(req.spec);
    const rng = createRng(req.seed);
    const result = req.type === 'deploy' ? bot.deploy(req.side, rng) : bot.orders(deserializeState(req.state), req.side, rng);
    post({ id: req.id, result });
  } catch (err) {
    post({ id: req.id, error: err instanceof Error ? err.message : String(err) });
  }
};
