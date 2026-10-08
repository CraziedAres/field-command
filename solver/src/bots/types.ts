import type { Deployment, GameState, Order, Rng, Side } from '@fc/engine';

/**
 * A pluggable player. Bots are stateless: every decision gets the full public state and its own seeded
 * RNG, so a game is reproducible from its seed. A bot never sees the opponent's orders for the day.
 */
export interface Bot {
  readonly name: string;
  deploy(side: Side, rng: Rng): Deployment;
  orders(state: GameState, side: Side, rng: Rng): Order[];
}
