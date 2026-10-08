import { INF2, UNITS_PER_SIDE, firstUnit, kindCode, sq, type GameState, type Kind, type Side } from '../src/index.ts';

/**
 * A hand-built position with only the listed units. A side without a General gets one parked in a far
 * corner (Blue A1, Red K11) so the game doesn't end by accident. Unused unit slots are removed units.
 */
export function position(units: Record<Side, Record<string, Kind>>, day = 0): GameState {
  const kind = new Uint8Array(2 * UNITS_PER_SIDE).fill(INF2);
  const pos = new Int16Array(2 * UNITS_PER_SIDE).fill(-1);
  for (const side of ['blue', 'red'] as const) {
    const entries = Object.entries(units[side]);
    if (!entries.some(([, k]) => k === 'GEN')) entries.unshift([side === 'blue' ? 'A1' : 'K11', 'GEN']);
    let u = firstUnit(side);
    for (const [name, k] of entries) {
      kind[u] = kindCode(k);
      pos[u++] = sq(name);
    }
  }
  return { day, kind, pos, result: null };
}

/** Kind on each occupied square, e.g. { blue: { A3: 'INF1' }, red: {...} }; parked Generals included. */
export function snapshot(state: GameState): Record<Side, Record<string, string>> {
  const out = { blue: {} as Record<string, string>, red: {} as Record<string, string> };
  state.pos.forEach((p, u) => {
    if (p < 0) return;
    const side = u < UNITS_PER_SIDE ? 'blue' : 'red';
    out[side][squareLabel(p)] = KIND_NAMES[state.kind[u]];
  });
  return out;
}

const KIND_NAMES = ['GEN', 'ART', 'INF1', 'INF2', 'INF3', 'CAV1', 'CAV2', 'CAV3', 'GUE'];
const squareLabel = (p: number) => `${'ABCDEFGHIJK'[Math.floor(p / 11)]}${(p % 11) + 1}`;
