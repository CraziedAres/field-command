export type Side = 'blue' | 'red';
export const SIDES: readonly Side[] = ['blue', 'red'];

export const KINDS = ['GEN', 'ART', 'INF1', 'INF2', 'INF3', 'CAV1', 'CAV2', 'CAV3', 'GUE'] as const;
export type Kind = (typeof KINDS)[number];

// Kind codes (index into KINDS).
export const GEN = 0, ART = 1, INF1 = 2, INF2 = 3, INF3 = 4, CAV1 = 5, CAV2 = 6, CAV3 = 7, GUE = 8;

// Arms.
export const A_GEN = 0, A_ART = 1, A_INF = 2, A_CAV = 3, A_GUE = 4;
export const ARM: readonly number[] = [A_GEN, A_ART, A_INF, A_INF, A_INF, A_CAV, A_CAV, A_CAV, A_GUE];
/** Rank 1..3 for infantry and cavalry, 0 otherwise. */
export const RANK: readonly number[] = [0, 0, 1, 2, 3, 1, 2, 3, 0];
/** Positions a unit may move per day. */
export const MOVE: readonly number[] = [1, 1, 2, 2, 2, 3, 3, 3, 3];
/** Units of each kind in one army. */
export const ARMY: readonly number[] = [1, 5, 3, 10, 4, 2, 7, 3, 5];

export const UNITS_PER_SIDE = 40;
export const MAX_ORDERS = 12;

export const kindCode = (k: Kind): number => KINDS.indexOf(k);
export const sideIndex = (s: Side): number => (s === 'blue' ? 0 : 1);
export const sideOfUnit = (unit: number): Side => (unit < UNITS_PER_SIDE ? 'blue' : 'red');
export const opponent = (s: Side): Side => (s === 'blue' ? 'red' : 'blue');
/** Unit ids: 0..39 are Blue, 40..79 are Red. */
export const firstUnit = (s: Side): number => sideIndex(s) * UNITS_PER_SIDE;
