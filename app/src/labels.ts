import {
  KINDS, MOVE, combat, A_WINS, B_WINS, BOARD, sideOfUnit, squareName, kindCode,
  type DayEvent, type Kind, type RejectReason, type Side,
} from '@fc/engine';

export const SHORT: Record<Kind, string> = {
  GEN: '★', ART: 'Art', INF1: 'I1', INF2: 'I2', INF3: 'I3', CAV1: 'C1', CAV2: 'C2', CAV3: 'C3', GUE: 'Gu',
};
export const NAME: Record<Kind, string> = {
  GEN: 'General', ART: 'Artillery', INF1: '1st Infantry', INF2: '2nd Infantry', INF3: '3rd Infantry',
  CAV1: '1st Cavalry', CAV2: '2nd Cavalry', CAV3: '3rd Cavalry', GUE: 'Guerrillas',
};
export const SIDE_NAME: Record<Side, string> = { blue: 'Blue', red: 'Red' };

export const REASON: Record<RejectReason, string> = {
  'over-limit': 'more than 12 orders',
  'off-board': 'off the board',
  'no-unit': 'no unit there',
  'no-move': 'not a move',
  'too-far': 'too far',
  'duplicate-unit': 'unit ordered twice',
  'same-destination': 'two units ordered to one square',
  blocked: 'a friendly unit will still be there',
};

export const kindOf = (kinds: Uint8Array, unit: number): Kind => KINDS[kinds[unit]];
export const moveOf = (k: Kind): number => MOVE[kindCode(k)];

export type Matchup = 'win' | 'lose' | 'both';
export function matchup(attacker: number, defender: number, square: number): Matchup {
  const o = combat(attacker, defender, BOARD.forest[square] === 1);
  return o === A_WINS ? 'win' : o === B_WINS ? 'lose' : 'both';
}

const unitLabel = (kinds: Uint8Array, u: number) => `${SIDE_NAME[sideOfUnit(u)]} ${NAME[kindOf(kinds, u)]}`;

/** One readable line per event. */
export function describe(e: DayEvent, kinds: Uint8Array): string {
  switch (e.type) {
    case 'move':
      return `${unitLabel(kinds, e.unit)} ${squareName(e.from)} → ${squareName(e.to)}`;
    case 'rejected':
      return `${SIDE_NAME[e.side]} order ${squareName(e.order.from)} → ${squareName(e.order.to)} failed: ${REASON[e.reason]}`;
    case 'confrontation': {
      const terrain = BOARD.forest[e.square] ? 'forest' : 'open field';
      const lost = e.removed.length === 2 ? 'both removed' : `${unitLabel(kinds, e.removed[0])} removed`;
      return `Clash at ${squareName(e.square)} (${terrain}): ${NAME[kindOf(kinds, e.blue)]} vs ${NAME[kindOf(kinds, e.red)]} — ${lost}`;
    }
    case 'artillery':
      return `${unitLabel(kinds, e.gun)} fires at ${unitLabel(kinds, e.target)}`;
    case 'end':
      return e.result.winner
        ? `${SIDE_NAME[e.result.winner]} wins: the enemy General is down`
        : e.result.reason === 'general' ? 'Draw: both Generals fell' : 'Draw: day limit reached';
  }
}
