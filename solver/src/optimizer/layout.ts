/**
 * A Layout is one army's deployment as 40 kind codes, one per square of Blue's zone in ascending square
 * order. The board is symmetric under a 180° turn, so the same Layout deploys Red by rotating each square:
 * one search space serves both sides.
 */
import {
  ARMY, BOARD, KINDS, rotate180, shuffle, squareName, sq, type Deployment, type Rng, type Side,
} from '@fc/engine';
import { heuristicDeployment } from '../bots/heuristic.ts';

export type Layout = number[];

export const ZONE: readonly number[] = [...BOARD.zone.blue].sort((a, b) => a - b);

export function toDeployment(layout: Layout, side: Side): Deployment {
  const dep: Deployment = {};
  layout.forEach((k, i) => (dep[squareName(side === 'blue' ? ZONE[i] : rotate180(ZONE[i]))] = KINDS[k]));
  return dep;
}

export function fromDeployment(dep: Deployment, side: Side): Layout {
  return ZONE.map((s) => KINDS.indexOf(dep[squareName(side === 'blue' ? s : rotate180(s))]));
}

export const layoutKey = (l: Layout): string => l.map((k) => 'GAijkcdeU'[k]).join('');

export function randomLayout(rng: Rng): Layout {
  return shuffle(rng, KINDS.flatMap((_, k) => new Array<number>(ARMY[k]).fill(k)));
}

export const heuristicLayout = (rng: Rng, noise = 1): Layout => fromDeployment(heuristicDeployment('blue', rng, noise), 'blue');

/** Swap two squares holding different kinds (one or two swaps). */
export function mutate(layout: Layout, rng: Rng): Layout {
  const out = layout.slice();
  const swaps = rng() < 0.3 ? 2 : 1;
  for (let n = 0; n < swaps; n++) {
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.floor(rng() * out.length), b = Math.floor(rng() * out.length);
      if (out[a] !== out[b]) {
        [out[a], out[b]] = [out[b], out[a]];
        break;
      }
    }
  }
  return out;
}

export const squareOf = (index: number): number => ZONE[index];
export const indexOf = (name: string): number => ZONE.indexOf(sq(name));
