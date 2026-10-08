import { BOARD, type Board } from './board.ts';
import { SQUARES, dist, squareName } from './coords.ts';
import type { Deployment, GameState } from './game.ts';
import type { Order } from './orders.ts';
import { ARMY, KINDS, MAX_ORDERS, MOVE, UNITS_PER_SIDE, firstUnit, type Kind, type Side } from './units.ts';
import { randInt, shuffle, type Rng } from './rng.ts';

export function randomDeployment(rng: Rng, side: Side, board: Board = BOARD): Deployment {
  const kinds: Kind[] = KINDS.flatMap((k, i) => new Array<Kind>(ARMY[i]).fill(k));
  shuffle(rng, kinds);
  const dep: Deployment = {};
  board.zone[side].forEach((s, i) => (dep[squareName(s)] = kinds[i]));
  return dep;
}

/** Up to 12 random in-range orders for living units (they may still collide and be rejected). */
export function randomOrders(rng: Rng, state: GameState, side: Side): Order[] {
  const first = firstUnit(side);
  const alive: number[] = [];
  for (let u = first; u < first + UNITS_PER_SIDE; u++) if (state.pos[u] >= 0) alive.push(u);
  shuffle(rng, alive);
  return alive.slice(0, randInt(rng, MAX_ORDERS + 1)).map((u) => {
    const from = state.pos[u];
    const options: number[] = [];
    for (let s = 0; s < SQUARES; s++) if (s !== from && dist(from, s) <= MOVE[state.kind[u]]) options.push(s);
    return { from, to: options[randInt(rng, options.length)] };
  });
}
