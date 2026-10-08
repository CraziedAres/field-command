import type { Board } from './board.ts';
import { SQUARES, dist } from './coords.ts';

/** Range of a gun against a target, by how far the target sits below it. */
export function artilleryRange(gunElevation: number, targetElevation: number): number {
  const below = gunElevation - targetElevation;
  return below >= 2 ? 3 : below === 1 ? 2 : below === 0 ? 1 : 0;
}

export function inRange(board: Board, gun: number, target: number): boolean {
  const d = dist(gun, target);
  return d > 0 && d <= artilleryRange(board.elevation[gun], board.elevation[target]);
}

/** Every square a gun on `gun` can hit. */
export function artilleryTargets(board: Board, gun: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < SQUARES; t++) if (inRange(board, gun, t)) out.push(t);
  return out;
}
