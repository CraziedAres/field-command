import { createGame, createRng, resolveDay, UNITS_PER_SIDE, type Deployment, type GameResult, type Side } from '@fc/engine';
import type { Bot } from './bots/types.ts';

export interface GameRecord {
  seed: number;
  blue: string;
  red: string;
  winner: Side | null;
  reason: GameResult['reason'];
  days: number;
  /** Units left per side at the end. */
  survivors: Record<Side, number>;
}

export interface PlayOptions {
  seed: number;
  maxDays?: number;
  /** Fixed deployments (the optimizer's use); otherwise each bot deploys. */
  deployments?: Partial<Record<Side, Deployment>>;
}

/** Independent, reproducible RNG streams per seed and purpose. */
export const stream = (seed: number, purpose: number) => createRng(Math.imul(seed, 0x9e3779b1) ^ Math.imul(purpose + 1, 0x85ebca77));

export function playGame(blue: Bot, red: Bot, { seed, maxDays = 100, deployments = {} }: PlayOptions): GameRecord {
  const rb = stream(seed, 1), rr = stream(seed, 2);
  let state = createGame(deployments.blue ?? blue.deploy('blue', rb), deployments.red ?? red.deploy('red', rr));
  while (!state.result) {
    const orders = { blue: blue.orders(state, 'blue', rb), red: red.orders(state, 'red', rr) };
    state = resolveDay(state, orders, { maxDays }).state;
  }
  const count = (from: number) => state.pos.slice(from, from + UNITS_PER_SIDE).filter((p) => p >= 0).length;
  return {
    seed, blue: blue.name, red: red.name,
    winner: state.result.winner, reason: state.result.reason, days: state.day,
    survivors: { blue: count(0), red: count(UNITS_PER_SIDE) },
  };
}
