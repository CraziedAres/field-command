import { inRange } from './artillery.ts';
import { BOARD, type Board } from './board.ts';
import { SQUARES, dist } from './coords.ts';
import type { GameState } from './game.ts';
import { ART, MOVE, UNITS_PER_SIDE, firstUnit, type Side } from './units.ts';

/** Squares a unit may be ordered to (within its move allowance; friendly squares allowed for swaps). */
export function reachable(state: GameState, unit: number): number[] {
  const from = state.pos[unit];
  if (from < 0) return [];
  const out: number[] = [];
  for (let s = 0; s < SQUARES; s++) if (s !== from && dist(from, s) <= MOVE[state.kind[unit]]) out.push(s);
  return out;
}

/** Per square, how many of `side`'s guns would hit an enemy (non-guerrilla) unit standing there. */
export function threatMap(state: GameState, side: Side, board: Board = BOARD): Uint8Array {
  const map = new Uint8Array(SQUARES);
  const first = firstUnit(side);
  for (let g = first; g < first + UNITS_PER_SIDE; g++) {
    if (state.kind[g] !== ART || state.pos[g] < 0) continue;
    for (let s = 0; s < SQUARES; s++) if (inRange(board, state.pos[g], s)) map[s]++;
  }
  return map;
}
