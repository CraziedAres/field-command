import { SQUARES, dist, isSquare } from './coords.ts';
import { MAX_ORDERS, MOVE, firstUnit, UNITS_PER_SIDE, type Side } from './units.ts';

/** One written order, "from-to", as square indices. */
export interface Order {
  from: number;
  to: number;
}

export type RejectReason =
  | 'over-limit' // beyond the 12th order
  | 'off-board'
  | 'no-unit' // no friendly unit on `from`
  | 'no-move' // from === to
  | 'too-far' // beyond the unit's move allowance
  | 'duplicate-unit' // the same unit ordered more than once
  | 'same-destination' // two moving units would end on one square
  | 'blocked'; // would end on a friendly unit that stays put (possibly via a cascade)

export interface Move {
  unit: number;
  from: number;
  to: number;
}

export interface Rejection {
  index: number;
  order: Order;
  reason: RejectReason;
}

export interface SideResolution {
  moves: Move[];
  rejected: Rejection[];
}

/** Unit kinds and positions (square per unit, -1 = removed), indexed by unit id. */
export interface Units {
  readonly kind: Uint8Array;
  readonly pos: Int16Array;
}

/**
 * Decide which of one side's orders are legal.
 *
 * Orders that are invalid on their own are dropped first, so a conflict only cancels orders that are
 * "otherwise legal" (rulebook footnote 2). Then the fixed point: every moving unit that would share its
 * final square with another friendly unit stays put, which can block further moves, until nothing changes.
 */
export function resolveSideOrders({ kind, pos }: Units, side: Side, orders: readonly Order[]): SideResolution {
  const first = firstUnit(side);
  const occupant = new Int16Array(SQUARES).fill(-1);
  for (let u = first; u < first + UNITS_PER_SIDE; u++) if (pos[u] >= 0) occupant[pos[u]] = u;

  const rejected: Rejection[] = [];
  const candidates: (Move & { index: number })[] = [];
  orders.forEach((order, index) => {
    const reject = (reason: RejectReason) => rejected.push({ index, order, reason });
    if (index >= MAX_ORDERS) return reject('over-limit');
    if (!isSquare(order.from) || !isSquare(order.to)) return reject('off-board');
    const unit = occupant[order.from];
    if (unit < 0) return reject('no-unit');
    if (order.from === order.to) return reject('no-move');
    if (dist(order.from, order.to) > MOVE[kind[unit]]) return reject('too-far');
    candidates.push({ index, unit, from: order.from, to: order.to });
  });

  // A unit with more than one otherwise-legal order moves nowhere.
  const perUnit = new Map<number, number>();
  for (const c of candidates) perUnit.set(c.unit, (perUnit.get(c.unit) ?? 0) + 1);
  let active = candidates.filter((c) => {
    if (perUnit.get(c.unit)! === 1) return true;
    rejected.push({ index: c.index, order: orders[c.index], reason: 'duplicate-unit' });
    return false;
  });

  // Fixed point over final-square collisions.
  for (let round = 0; ; round++) {
    const final = new Int16Array(SQUARES);
    const movers = new Int16Array(SQUARES);
    const moving = new Set(active.map((m) => m.unit));
    for (let u = first; u < first + UNITS_PER_SIDE; u++) if (pos[u] >= 0 && !moving.has(u)) final[pos[u]]++;
    for (const m of active) {
      final[m.to]++;
      movers[m.to]++;
    }
    const keep = active.filter((m) => {
      if (final[m.to] === 1) return true;
      const reason = round === 0 && movers[m.to] === final[m.to] ? 'same-destination' : 'blocked';
      rejected.push({ index: m.index, order: orders[m.index], reason });
      return false;
    });
    if (keep.length === active.length) break;
    active = keep;
  }

  rejected.sort((a, b) => a.index - b.index);
  return { moves: active.map(({ unit, from, to }) => ({ unit, from, to })), rejected };
}
