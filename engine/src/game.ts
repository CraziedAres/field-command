import { inRange } from './artillery.ts';
import { BOARD, type Board } from './board.ts';
import { combat, A_WINS, B_WINS } from './combat.ts';
import { SQUARES, sq, squareName } from './coords.ts';
import { resolveSideOrders, type Move, type Order, type Rejection } from './orders.ts';
import {
  ARMY, ART, GEN, GUE, KINDS, UNITS_PER_SIDE, SIDES, firstUnit, kindCode, sideOfUnit,
  type Kind, type Side,
} from './units.ts';

export interface GameResult {
  /** null = draw. */
  winner: Side | null;
  reason: 'general' | 'max-days';
}

/**
 * Full game state after both deployments are revealed. Units are indexed by id (0..39 Blue, 40..79 Red).
 * Treat as immutable: resolveDay returns a new state.
 */
export interface GameState {
  /** Days completed so far. */
  readonly day: number;
  readonly kind: Uint8Array;
  /** Square per unit, -1 once removed. */
  readonly pos: Int16Array;
  readonly result: GameResult | null;
}

/** A deployment maps square names (e.g. "A8") to unit kinds. */
export type Deployment = Record<string, Kind>;

export interface GameOptions {
  board?: Board;
  /** After this many days without a winner the game is a draw. Omit for no limit. */
  maxDays?: number;
}

export type DayEvent =
  | ({ type: 'move'; side: Side } & Move)
  | ({ type: 'rejected'; side: Side } & Rejection)
  | { type: 'confrontation'; square: number; blue: number; red: number; removed: number[] }
  | { type: 'artillery'; gun: number; target: number }
  | { type: 'end'; result: GameResult };

/** Problems with a deployment; empty when it is legal. */
export function validateDeployment(side: Side, deployment: Deployment, board: Board = BOARD): string[] {
  const errors: string[] = [];
  const zone = new Set(board.zone[side]);
  const counts = new Array<number>(KINDS.length).fill(0);
  for (const [name, kind] of Object.entries(deployment)) {
    let s: number;
    try {
      s = sq(name);
    } catch {
      errors.push(`${name}: not a square`);
      continue;
    }
    if (!zone.has(s)) errors.push(`${name}: outside the ${side} deployment zone`);
    const k = kindCode(kind);
    if (k < 0) errors.push(`${name}: unknown unit ${kind}`);
    else counts[k]++;
  }
  KINDS.forEach((k, i) => {
    if (counts[i] !== ARMY[i]) errors.push(`${k}: ${counts[i]} placed, ${ARMY[i]} required`);
  });
  return errors;
}

export function createGame(blue: Deployment, red: Deployment, board: Board = BOARD): GameState {
  const kind = new Uint8Array(2 * UNITS_PER_SIDE);
  const pos = new Int16Array(2 * UNITS_PER_SIDE);
  for (const [side, dep] of [['blue', blue], ['red', red]] as const) {
    const errors = validateDeployment(side, dep, board);
    if (errors.length) throw new Error(`Invalid ${side} deployment:\n${errors.join('\n')}`);
    // Unit ids follow the zone's square order so ids are stable for a given deployment.
    let u = firstUnit(side);
    for (const s of [...board.zone[side]].sort((a, b) => a - b)) {
      kind[u] = kindCode(dep[squareName(s)]);
      pos[u++] = s;
    }
  }
  return { day: 0, kind, pos, result: null };
}

/** Resolve one day: both order lists execute at once, then confrontations, then artillery fire. */
export function resolveDay(
  state: GameState,
  orders: Readonly<Record<Side, readonly Order[]>>,
  { board = BOARD, maxDays }: GameOptions = {},
): { state: GameState; events: DayEvent[] } {
  if (state.result) throw new Error('Game is already over');
  const events: DayEvent[] = [];
  const pos = state.pos.slice();
  const kind = state.kind;

  // 1. Movement. Each side's legality depends only on its own units.
  for (const side of SIDES) {
    const { moves, rejected } = resolveSideOrders(state, side, orders[side]);
    for (const r of rejected) events.push({ type: 'rejected', side, ...r });
    for (const m of moves) {
      pos[m.unit] = m.to;
      events.push({ type: 'move', side, ...m });
    }
  }

  // 2. Confrontations wherever opposing units share a square.
  const blueAt = new Int16Array(SQUARES).fill(-1);
  for (let u = 0; u < UNITS_PER_SIDE; u++) if (pos[u] >= 0) blueAt[pos[u]] = u;
  for (let r = UNITS_PER_SIDE; r < 2 * UNITS_PER_SIDE; r++) {
    const square = pos[r];
    const b = square >= 0 ? blueAt[square] : -1;
    if (b < 0) continue;
    const outcome = combat(kind[b], kind[r], board.forest[square] === 1);
    const removed = outcome === A_WINS ? [r] : outcome === B_WINS ? [b] : [b, r];
    for (const u of removed) pos[u] = -1;
    events.push({ type: 'confrontation', square, blue: b, red: r, removed });
  }

  // 3. Artillery: every surviving gun fires at once, so guns in range of each other all fire.
  const hit = new Set<number>();
  for (let gun = 0; gun < 2 * UNITS_PER_SIDE; gun++) {
    if (kind[gun] !== ART || pos[gun] < 0) continue;
    const enemy = firstUnit(sideOfUnit(gun) === 'blue' ? 'red' : 'blue');
    for (let t = enemy; t < enemy + UNITS_PER_SIDE; t++) {
      if (pos[t] < 0 || kind[t] === GUE || !inRange(board, pos[gun], pos[t])) continue;
      hit.add(t);
      events.push({ type: 'artillery', gun, target: t });
    }
  }
  for (const t of hit) pos[t] = -1;

  // 4. Win, draw or day limit.
  const day = state.day + 1;
  const blueGen = generalAlive(kind, pos, 'blue');
  const redGen = generalAlive(kind, pos, 'red');
  let result: GameResult | null = null;
  if (!blueGen || !redGen) result = { winner: blueGen ? 'blue' : redGen ? 'red' : null, reason: 'general' };
  else if (maxDays !== undefined && day >= maxDays) result = { winner: null, reason: 'max-days' };
  if (result) events.push({ type: 'end', result });

  return { state: { day, kind, pos, result }, events };
}

function generalAlive(kind: Uint8Array, pos: Int16Array, side: Side): boolean {
  const first = firstUnit(side);
  for (let u = first; u < first + UNITS_PER_SIDE; u++) if (kind[u] === GEN) return pos[u] >= 0;
  return false;
}

/** Unit on a square, or -1. */
export function unitAt(state: Pick<GameState, 'pos'>, square: number): number {
  return state.pos.indexOf(square);
}

/** JSON-friendly form of a GameState (for storage and the network). */
export interface SerializedState {
  day: number;
  kind: number[];
  pos: number[];
  result: GameResult | null;
}

export const serializeState = (s: GameState): SerializedState => ({
  day: s.day,
  kind: [...s.kind],
  pos: [...s.pos],
  result: s.result,
});

export const deserializeState = (j: SerializedState): GameState => ({
  day: j.day,
  kind: Uint8Array.from(j.kind),
  pos: Int16Array.from(j.pos),
  result: j.result,
});
