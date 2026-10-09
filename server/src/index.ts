import { DurableObject } from 'cloudflare:workers';
import { opponent, type Side } from '@fc/engine';
import {
  RoomError, addPush, awaiting, deploy, join, newRoom, rename, seatOf, submitOrders, viewFor, type Room,
} from './room.ts';
import { sendPush, type Vapid } from './push.ts';

export interface Env {
  GAMES: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

/** One game. All changes go through this object, one request at a time, so there are no races. */
export class GameRoom extends DurableObject<Env> {
  private async load(): Promise<Room> {
    const room = await this.ctx.storage.get<Room>('room');
    if (!room) throw new RoomError('No such game');
    return room;
  }

  async create(code: string, side: Side, origin: string, maxDays?: number, name?: unknown) {
    if (await this.ctx.storage.get('room')) throw new RoomError('exists');
    const token = randomToken();
    await this.ctx.storage.put('room', newRoom(code, side, token, origin, maxDays, name));
    return { token, side };
  }

  async join(name?: unknown) {
    const room = await this.load();
    const token = randomToken();
    const side = join(room, token, name);
    await this.changed(room, side);
    return { token, side };
  }

  async view(token: string) {
    const room = await this.load();
    return viewFor(room, seatOf(room, token));
  }

  async deploy(token: string, deployment: unknown) {
    const room = await this.load();
    const side = seatOf(room, token);
    deploy(room, side, deployment);
    await this.changed(room, side);
    return viewFor(room, side);
  }

  async orders(token: string, day: number, orders: unknown) {
    const room = await this.load();
    const side = seatOf(room, token);
    submitOrders(room, side, day, orders);
    await this.changed(room, side);
    return viewFor(room, side);
  }

  async rename(token: string, name: unknown) {
    const room = await this.load();
    const side = seatOf(room, token);
    rename(room, side, name);
    await this.changed(room, side, false);
    return viewFor(room, side);
  }

  async subscribe(token: string, subscription: unknown) {
    const room = await this.load();
    addPush(room, seatOf(room, token), subscription);
    await this.ctx.storage.put('room', room);
  }

  /** Save, tell connected clients to refresh, and notify the other player if it's now their move. */
  private async changed(room: Room, actor: Side, notify = true) {
    await this.ctx.storage.put('room', room);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send('update');
      } catch {
        // socket already closing
      }
    }
    const other = opponent(actor);
    if (notify && awaiting(room, other)) this.ctx.waitUntil(this.notify(room, other));
  }

  private async notify(room: Room, side: Side) {
    const seat = room.seats[side];
    if (!seat?.push.length || !this.env.VAPID_PUBLIC_KEY || !this.env.VAPID_PRIVATE_JWK) return;
    const vapid: Vapid = { publicKey: this.env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(this.env.VAPID_PRIVATE_JWK), subject: room.origin };
    const gone: string[] = [];
    for (const sub of seat.push) {
      try {
        const status = await sendPush(sub.endpoint, vapid);
        if (status === 404 || status === 410) gone.push(sub.endpoint);
      } catch (e) {
        console.error('push failed', e);
      }
    }
    if (gone.length) {
      const fresh = await this.load();
      fresh.seats[side]!.push = fresh.seats[side]!.push.filter((p) => !gone.includes(p.endpoint));
      await this.ctx.storage.put('room', fresh);
    }
  }

  /** WebSocket for live "something changed" pings (hibernatable, so idle games cost nothing). */
  async fetch(request: Request): Promise<Response> {
    const room = await this.load();
    const side = seatOf(room, new URL(request.url).searchParams.get('token') ?? '');
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [side]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, 'closing');
    } catch {
      // already closed
    }
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function api(request: Request, url: URL, env: Env): Promise<Response> {
  const body = async () => (request.method === 'POST' ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {});

  if (url.pathname === '/api/vapid') return json({ publicKey: env.VAPID_PUBLIC_KEY ?? null });

  if (url.pathname === '/api/games' && request.method === 'POST') {
    const b = await body();
    const side: Side = b.side === 'red' ? 'red' : 'blue';
    const maxDays = typeof b.maxDays === 'number' ? b.maxDays : undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        const seat = await env.GAMES.get(env.GAMES.idFromName(code)).create(code, side, url.origin, maxDays, b.name);
        return json({ code, ...seat });
      } catch (e) {
        if (!(e instanceof Error) || e.message !== 'exists') throw e;
      }
    }
    throw new RoomError('Could not allocate a game code');
  }

  const m = /^\/api\/games\/([A-Z0-9]{6})(?:\/(join|deploy|orders|name|push|ws))?$/.exec(url.pathname);
  if (!m) return json({ error: 'Not found' }, 404);
  const [, code, action] = m;
  const room = env.GAMES.get(env.GAMES.idFromName(code));
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  if (action === 'ws') {
    if (request.headers.get('upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket' }, 426);
    return room.fetch(request);
  }
  if (!action && request.method === 'GET') return json(await room.view(token));
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const b = await body();
  switch (action) {
    case 'join':
      return json(await room.join(b.name));
    case 'deploy':
      return json(await room.deploy(token, b.deployment));
    case 'orders':
      return json(await room.orders(token, Number(b.day), b.orders));
    case 'name':
      return json(await room.rename(token, b.name));
    case 'push':
      await room.subscribe(token, b.subscription);
      return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, url, env);
    } catch (e) {
      // Errors thrown inside the Durable Object arrive here as plain Errors carrying the message.
      const message = e instanceof Error ? e.message : String(e);
      const status = /No such game/.test(message) ? 404 : /Not a player/.test(message) ? 403 : 400;
      return json({ error: message }, status);
    }
  },
} satisfies ExportedHandler<Env>;
