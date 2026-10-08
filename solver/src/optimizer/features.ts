/**
 * Cheap static features of a layout (in Blue's frame). Used to discard obviously bad search moves before
 * simulating them, and reported with the results so their link to win rate can be analysed.
 */
import { ARM, A_CAV, A_GUE, A_INF, ART, BOARD, GEN, dist, rotate180, rowOf } from '@fc/engine';
import { TARGETS, within } from '../bots/features.ts';
import { ZONE, type Layout } from './layout.ts';

export interface Features {
  /** General's distance from the home edge in rows (0 = back row). */
  generalDepth: number;
  /** Days before an enemy Cavalry or Guerrilla (move 3) could reach the General from the nearest enemy setup square. */
  generalRaidDays: number;
  /** Neighbours of the General that beat both Cavalry and Guerrillas on the General's square (bodyguards). */
  generalBodyguards: number;
  /** Squares within 3 of the General covered by own guns at the start. */
  generalGunCover: number;
  /** Mean elevation of the guns. */
  gunElevation: number;
  /** Share of infantry on forest squares. */
  infantryInForest: number;
  /** Share of cavalry on open squares. */
  cavalryInOpen: number;
  /** Mean depth (rows from home edge) of the guerrillas. */
  guerrillaDepth: number;
}

const ENEMY_ZONE = ZONE.map(rotate180);

export function features(layout: Layout): Features {
  const at = (k: number) => layout.flatMap((kind, i) => (kind === k ? [ZONE[i]] : []));
  const of = (pred: (k: number) => boolean) => layout.flatMap((kind, i) => (pred(kind) ? [ZONE[i]] : []));
  const general = at(GEN)[0];
  const guns = at(ART);
  const infantry = of((k) => ARM[k] === A_INF);
  const cavalry = of((k) => ARM[k] === A_CAV);
  const guerrillas = of((k) => ARM[k] === A_GUE);

  const forest = BOARD.forest[general] === 1;
  const guardArm = forest ? A_INF : A_CAV; // the arm that beats both Cavalry and Guerrillas here
  const kindAt = new Map(layout.map((k, i) => [ZONE[i], k]));
  const bodyguards = within(general, 1).filter((s) => s !== general && ARM[kindAt.get(s) ?? -1] === guardArm).length;

  const covered = new Set<number>();
  for (const g of guns) for (const t of TARGETS[g]) covered.add(t);
  const near = within(general, 3);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    generalDepth: rowOf(general),
    generalRaidDays: Math.ceil(Math.min(...ENEMY_ZONE.map((s) => dist(s, general))) / 3),
    generalBodyguards: bodyguards,
    generalGunCover: near.filter((s) => covered.has(s)).length,
    gunElevation: mean(guns.map((s) => BOARD.elevation[s])),
    infantryInForest: mean(infantry.map((s) => BOARD.forest[s])),
    cavalryInOpen: mean(cavalry.map((s) => 1 - BOARD.forest[s])),
    guerrillaDepth: mean(guerrillas.map(rowOf)),
  };
}

/** A rough prior used only to skip clearly worse search moves. */
export function staticScore(f: Features): number {
  return 1.5 * f.generalRaidDays + 0.6 * f.generalBodyguards + 0.05 * f.generalGunCover + 0.4 * f.gunElevation
    + 0.5 * f.infantryInForest + 0.5 * f.cavalryInOpen;
}

