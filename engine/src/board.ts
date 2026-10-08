import data from '../board.json' with { type: 'json' };
import { SQUARES, sq } from './coords.ts';
import { UNITS_PER_SIDE, type Side } from './units.ts';

export interface BoardJson {
  squares: Record<string, { terrain: string; elevation: number }>;
  deployment: Record<Side, string[]>;
}

export interface Board {
  /** 1 = forest (green), 0 = open field (beige). */
  readonly forest: Uint8Array;
  /** Elevation 1..3. */
  readonly elevation: Uint8Array;
  /** Deployment squares per side. */
  readonly zone: Readonly<Record<Side, readonly number[]>>;
}

export function loadBoard(json: BoardJson): Board {
  const forest = new Uint8Array(SQUARES);
  const elevation = new Uint8Array(SQUARES);
  const seen = new Set<number>();
  for (const [name, s] of Object.entries(json.squares)) {
    const i = sq(name);
    if (s.terrain !== 'forest' && s.terrain !== 'open') throw new Error(`${name}: bad terrain ${s.terrain}`);
    if (![1, 2, 3].includes(s.elevation)) throw new Error(`${name}: bad elevation ${s.elevation}`);
    forest[i] = s.terrain === 'forest' ? 1 : 0;
    elevation[i] = s.elevation;
    seen.add(i);
  }
  if (seen.size !== SQUARES) throw new Error(`Board defines ${seen.size} squares, expected ${SQUARES}`);
  const zone = { blue: json.deployment.blue.map(sq), red: json.deployment.red.map(sq) };
  for (const side of ['blue', 'red'] as const) {
    if (new Set(zone[side]).size !== UNITS_PER_SIDE) throw new Error(`${side} zone must have ${UNITS_PER_SIDE} distinct squares`);
  }
  if (zone.blue.some((s) => zone.red.includes(s))) throw new Error('Deployment zones overlap');
  return { forest, elevation, zone };
}

/** The real Field Command board (engine/board.json). */
export const BOARD: Board = loadBoard(data);
