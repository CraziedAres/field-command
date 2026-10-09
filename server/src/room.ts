/**
 * Online game rooms as plain data plus pure functions, so the hidden-information rules can be unit
 * tested without the Cloudflare runtime. The Durable Object stores one Room and calls these.
 */
import {
  MAX_ORDERS, createGame, deserializeState, isSquare, opponent, resolveDay, serializeState, validateDeployment,
  type Deployment, type GameResult, type Order, type SerializedState, type Side,
} from '@fc/engine';

export interface PushSub {
  endpoint: string;
  keys?: { p256dh: string; auth: string };
}

export interface Seat {
  token: string;
  /** What the player chose to be called in this game (shown to both players). */
  name?: string;
  push: PushSub[];
}

export interface Room {
  code: string;
  created: number;
  /** Origin the game was created from; used as the web push contact. */
  origin: string;
  maxDays?: number;
  seats: Partial<Record<Side, Seat>>;
  deployments: Partial<Record<Side, Deployment>>;
  /** Positions at the start of day 1 (null until both sides have deployed). */
  initial: SerializedState | null;
  state: SerializedState | null;
  /** Orders submitted for the day in progress; secret until both are in. */
  pending: Partial<Record<Side, Order[]>>;
  /** Both sides' orders for every resolved day. Replaying them from `initial` rebuilds the game. */
  history: Record<Side, Order[]>[];
}

export type Phase = 'deploy' | 'orders' | 'over';

/** Everything one player may see. Never contains the opponent's deployment or orders while they're secret. */
export interface PlayerView {
  code: string;
  you: Side;
  maxDays?: number;
  phase: Phase;
  opponentJoined: boolean;
  myName: string | null;
  opponentName: string | null;
  myDeployment: Deployment | null;
  opponentDeployed: boolean;
  initial: SerializedState | null;
  history: Record<Side, Order[]>[];
  myOrders: Order[] | null;
  opponentSubmitted: boolean;
  result: GameResult | null;
}

export class RoomError extends Error {}

export const MAX_NAME = 24;

/** Trim and collapse whitespace, strip control characters and cap the length; empty means no name. */
export function cleanName(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') throw new RoomError('Invalid name');
  const name = Array.from(raw.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, MAX_NAME).join('').trim();
  return name || undefined;
}

export function newRoom(code: string, side: Side, token: string, origin: string, maxDays?: number, name?: unknown): Room {
  if (maxDays !== undefined && !(Number.isInteger(maxDays) && maxDays > 0 && maxDays <= 1000)) throw new RoomError('Invalid day limit');
  return {
    code, created: Date.now(), origin, maxDays,
    seats: { [side]: { token, name: cleanName(name), push: [] } },
    deployments: {}, initial: null, state: null, pending: {}, history: [],
  };
}

/** Take the free seat. */
export function join(room: Room, token: string, name?: unknown): Side {
  const side = (['blue', 'red'] as const).find((s) => !room.seats[s]);
  if (!side) throw new RoomError('This game already has two players');
  room.seats[side] = { token, name: cleanName(name), push: [] };
  return side;
}

/** Set or clear (empty string) a player's name. Allowed at any time, even after the game ends. */
export function rename(room: Room, side: Side, name: unknown): void {
  room.seats[side]!.name = cleanName(name ?? '');
}

export function seatOf(room: Room, token: string): Side {
  for (const side of ['blue', 'red'] as const) if (token && room.seats[side]?.token === token) return side;
  throw new RoomError('Not a player in this game');
}

export function phase(room: Room): Phase {
  if (room.state?.result) return 'over';
  return room.initial ? 'orders' : 'deploy';
}

export function deploy(room: Room, side: Side, deployment: unknown): void {
  if (phase(room) !== 'deploy') throw new RoomError('Deployment is over');
  if (room.deployments[side]) throw new RoomError('You have already deployed');
  if (typeof deployment !== 'object' || deployment === null || Array.isArray(deployment)) throw new RoomError('Invalid deployment');
  const errors = validateDeployment(side, deployment as Deployment);
  if (errors.length) throw new RoomError(`Invalid deployment: ${errors.join('; ')}`);
  room.deployments[side] = { ...(deployment as Deployment) };
  const { blue, red } = room.deployments;
  if (blue && red) room.initial = room.state = serializeState(createGame(blue, red));
}

/** Store (or replace) a side's orders for `day`; resolves the day once both are in. Returns true if it resolved. */
export function submitOrders(room: Room, side: Side, day: number, orders: unknown): boolean {
  if (phase(room) !== 'orders') throw new RoomError(phase(room) === 'over' ? 'The game is over' : 'Both armies must deploy first');
  const current = room.state!.day + 1;
  if (day !== current) throw new RoomError(`Orders are for day ${current}, not day ${day}`);
  room.pending[side] = parseOrders(orders);
  const { blue, red } = room.pending;
  if (!blue || !red) return false;
  const next = resolveDay(deserializeState(room.state!), { blue, red }, { maxDays: room.maxDays });
  room.history.push({ blue, red });
  room.state = serializeState(next.state);
  room.pending = {};
  return true;
}

function parseOrders(orders: unknown): Order[] {
  if (!Array.isArray(orders) || orders.length > MAX_ORDERS) throw new RoomError(`Send at most ${MAX_ORDERS} orders`);
  return orders.map((o) => {
    if (typeof o !== 'object' || o === null || !isSquare((o as Order).from) || !isSquare((o as Order).to)) throw new RoomError('Invalid order');
    return { from: (o as Order).from, to: (o as Order).to };
  });
}

/** Whether `side` has something to do right now. */
export function awaiting(room: Room, side: Side): boolean {
  if (!room.seats[side]) return false;
  const p = phase(room);
  return p === 'deploy' ? !room.deployments[side] : p === 'orders' ? !room.pending[side] : false;
}

export function viewFor(room: Room, side: Side): PlayerView {
  const other = opponent(side);
  return {
    code: room.code,
    you: side,
    maxDays: room.maxDays,
    phase: phase(room),
    opponentJoined: !!room.seats[other],
    myName: room.seats[side]?.name ?? null,
    opponentName: room.seats[other]?.name ?? null,
    myDeployment: room.deployments[side] ?? null,
    opponentDeployed: !!room.deployments[other],
    initial: room.initial,
    history: room.history,
    myOrders: room.pending[side] ?? null,
    opponentSubmitted: !!room.pending[other],
    result: room.state?.result ?? null,
  };
}

export function addPush(room: Room, side: Side, sub: unknown): void {
  const s = sub as PushSub;
  if (typeof s?.endpoint !== 'string' || !s.endpoint.startsWith('https://')) throw new RoomError('Invalid push subscription');
  const seat = room.seats[side]!;
  seat.push = [...seat.push.filter((p) => p.endpoint !== s.endpoint), { endpoint: s.endpoint, keys: s.keys }].slice(-5);
}
