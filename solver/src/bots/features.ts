/** Fast position features shared by the bots: who can reach which square, gun coverage, evaluation. */
import {
  ARM, ART, A_CAV, A_GUE, A_INF, BOARD, GEN, MOVE, SIZE, SQUARES, UNITS_PER_SIDE,
  artilleryTargets, colOf, firstUnit, opponent, rowOf, type GameState, type Side,
} from '@fc/engine';

/** Material value per kind (the General is handled separately: losing it loses the game). */
export const VALUE: readonly number[] = [0, 6, 3, 3, 3, 4, 4, 4, 4];
export const isFighter = (kind: number) => ARM[kind] === A_INF || ARM[kind] === A_CAV || ARM[kind] === A_GUE;

/** Squares each square's gun can hit, precomputed for the real board. */
export const TARGETS: readonly number[][] = Array.from({ length: SQUARES }, (_, s) => artilleryTargets(BOARD, s));

/** Squares within `m` orthogonal steps of `sq`, including `sq` itself. */
const WITHIN: readonly (readonly number[])[][] = [0, 1, 2, 3].map((m) =>
  Array.from({ length: SQUARES }, (_, sq) => {
    const out: number[] = [];
    const r0 = rowOf(sq), c0 = colOf(sq);
    for (let r = Math.max(0, r0 - m); r <= Math.min(SIZE - 1, r0 + m); r++) {
      const left = m - Math.abs(r - r0);
      for (let c = Math.max(0, c0 - left); c <= Math.min(SIZE - 1, c0 + left); c++) out.push(r * SIZE + c);
    }
    return out;
  }),
);
export const within = (sq: number, m: number): readonly number[] => WITHIN[m][sq];

export function alive(state: GameState, side: Side): number[] {
  const out: number[] = [];
  const first = firstUnit(side);
  for (let u = first; u < first + UNITS_PER_SIDE; u++) if (state.pos[u] >= 0) out.push(u);
  return out;
}

export function generalSquare(state: GameState, side: Side): number {
  const first = firstUnit(side);
  for (let u = first; u < first + UNITS_PER_SIDE; u++) if (state.kind[u] === GEN) return state.pos[u];
  return -1;
}

/** Owner of each square (unit id) or -1. */
export function occupancy(state: GameState): Int16Array {
  const occ = new Int16Array(SQUARES).fill(-1);
  state.pos.forEach((p, u) => p >= 0 && (occ[p] = u));
  return occ;
}

/** For each square, the units of `side` that could stand there after the next day (moving or staying). */
export function reach(state: GameState, side: Side): number[][] {
  const out: number[][] = Array.from({ length: SQUARES }, () => []);
  for (const u of alive(state, side)) for (const s of within(state.pos[u], MOVE[state.kind[u]])) out[s].push(u);
  return out;
}

/** How many of `side`'s guns cover each square now, and after each gun's possible one-square move. */
export function gunCover(state: GameState, side: Side): { now: Uint8Array; next: Uint8Array } {
  const now = new Uint8Array(SQUARES), next = new Uint8Array(SQUARES);
  for (const g of alive(state, side)) {
    if (state.kind[g] !== ART) continue;
    for (const t of TARGETS[state.pos[g]]) now[t]++;
    const seen = new Uint8Array(SQUARES);
    for (const from of within(state.pos[g], 1)) for (const t of TARGETS[from]) seen[t] = 1;
    for (let s = 0; s < SQUARES; s++) next[s] += seen[s];
  }
  return { now, next };
}

/** How exposed a General on `sq` is: enemy units that could step onto it, plus guns that could hit it. */
export function generalDanger(state: GameState, side: Side, sq: number, foeReach = reach(state, opponent(side)), foeGuns = gunCover(state, opponent(side))): number {
  if (sq < 0) return 0;
  return foeReach[sq].length + foeGuns.next[sq];
}

/** Static evaluation from `side`'s point of view: material, plus how exposed each General is. */
export function evaluate(state: GameState, side: Side): number {
  if (state.result) return state.result.winner === side ? 1000 : state.result.winner === null ? 0 : -1000;
  const foe = opponent(side);
  const mineFirst = firstUnit(side);
  let material = 0;
  state.pos.forEach((p, u) => {
    if (p < 0) return;
    const own = u >= mineFirst && u < mineFirst + UNITS_PER_SIDE;
    material += own ? VALUE[state.kind[u]] : -VALUE[state.kind[u]];
  });
  const mine = generalDanger(state, side, generalSquare(state, side));
  const theirs = generalDanger(state, foe, generalSquare(state, foe));
  return material + 25 * (theirs - mine);
}
