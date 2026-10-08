import type { DayEvent, Deployment, Order, SerializedState, Side } from '@fc/engine';
import type { Level } from './bot/client.ts';

export interface DayRecord {
  day: number;
  events: DayEvent[];
  /** Positions before the day was resolved, for replaying the reveal. */
  before: SerializedState;
}

export interface HotseatGame {
  maxDays?: number;
  deployments: Partial<Record<Side, Deployment>>;
  state: SerializedState | null;
  /** Orders submitted for the day in progress. */
  orders: Partial<Record<Side, Order[]>>;
  history: DayRecord[];
  /** Set when one side is played by the computer. */
  computer?: { human: Side; level: Level };
}

export type Screen =
  | { name: 'menu' }
  | { name: 'pass'; to: Side; then: 'deploy' | 'orders' }
  | { name: 'deploy'; side: Side }
  | { name: 'orders'; side: Side }
  | { name: 'reveal' }
  | { name: 'thinking' };

export interface Saved {
  screen: Screen;
  game: HotseatGame | null;
}

const KEY = 'field-command.hotseat.v1';

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function save(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage unavailable (private mode etc.): the game still works, it just won't survive a reload.
  }
}
