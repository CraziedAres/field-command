import type { Deployment, Order, Side } from '@fc/engine';
import type { PlayerView } from '@fc/server/room';

export type { PlayerView };

/** What this device knows about one online game. */
export interface Identity {
  token: string;
  side?: Side;
  /** Days whose reveal this device has already shown. */
  seenDay: number;
  push?: boolean;
  added: number;
}

const KEY = 'field-command.online.v1';

export function identities(): Record<string, Identity> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Identity>;
  } catch {
    return {};
  }
}

export function saveIdentity(code: string, id: Identity | null): void {
  const all = identities();
  if (id) all[code] = id;
  else delete all[code];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: this session still works
  }
}

const NAME_KEY = 'field-command.name.v1';
export const MAX_NAME = 24;

/** The name this device last used, offered as the default for the next game. */
export function lastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // storage unavailable
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({ error: `Server error (${res.status})` }))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Server error (${res.status})`, res.status);
  return data;
}

export const api = {
  create: (side: Side, maxDays?: number, name?: string) =>
    call<{ code: string; token: string; side: Side }>('/api/games', { method: 'POST', body: { side, maxDays, name } }),
  join: (code: string, name?: string) => call<{ token: string; side: Side }>(`/api/games/${code}/join`, { method: 'POST', body: { name } }),
  rename: (code: string, token: string, name: string) =>
    call<PlayerView>(`/api/games/${code}/name`, { method: 'POST', token, body: { name } }),
  view: (code: string, token: string) => call<PlayerView>(`/api/games/${code}`, { token }),
  deploy: (code: string, token: string, deployment: Deployment) =>
    call<PlayerView>(`/api/games/${code}/deploy`, { method: 'POST', token, body: { deployment } }),
  orders: (code: string, token: string, day: number, orders: Order[]) =>
    call<PlayerView>(`/api/games/${code}/orders`, { method: 'POST', token, body: { day, orders } }),
  push: (code: string, token: string, subscription: PushSubscriptionJSON) =>
    call<{ ok: true }>(`/api/games/${code}/push`, { method: 'POST', token, body: { subscription } }),
  vapidKey: () => call<{ publicKey: string | null }>('/api/vapid').then((r) => r.publicKey),
};

export const socketUrl = (code: string, token: string) =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/games/${code}/ws?token=${encodeURIComponent(token)}`;

/** Link to send the opponent. */
export const inviteLink = (code: string) => `${location.origin}/g/${code}`;
/** Private link that restores your seat on another device or in the installed app. */
export const playerLink = (code: string, token: string) => `${location.origin}/g/${code}#t=${token}`;

/** Accepts a code ("ABC234"), an invite link or a player link. */
export function parseGameInput(input: string): { code: string; token?: string } | null {
  const m = /(?:^|\/g\/)([A-Za-z0-9]{6})\/?(?:#t=([0-9a-f]{32}))?$/.exec(input.trim());
  return m ? { code: m[1].toUpperCase(), token: m[2] } : null;
}
