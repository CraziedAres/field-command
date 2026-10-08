import { ARM, RANK, GEN, ART, A_INF, A_CAV, A_GUE } from './units.ts';

/** Result of a confrontation between unit kind `a` and unit kind `b`. */
export const BOTH = 0, A_WINS = 1, B_WINS = 2;
export type Outcome = typeof BOTH | typeof A_WINS | typeof B_WINS;

/** Cross-arm wins among Infantry, Cavalry and Guerrillas, which depend on terrain. */
function armBeats(x: number, y: number, forest: boolean): boolean {
  return forest
    ? (x === A_INF && (y === A_CAV || y === A_GUE)) || (x === A_GUE && y === A_CAV)
    : (x === A_CAV && (y === A_INF || y === A_GUE)) || (x === A_GUE && y === A_INF);
}

/** Two opposing units ending on one square. Rank only matters within the same arm. */
export function combat(a: number, b: number, forest: boolean): Outcome {
  if (a === b) return BOTH;
  if (a === GEN) return B_WINS;
  if (b === GEN) return A_WINS;
  if (a === ART) return B_WINS;
  if (b === ART) return A_WINS;
  if (ARM[a] === ARM[b]) return RANK[b] === (RANK[a] % 3) + 1 ? A_WINS : B_WINS; // 1>2>3>1
  return armBeats(ARM[a], ARM[b], forest) ? A_WINS : B_WINS;
}
