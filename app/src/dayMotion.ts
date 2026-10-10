import type { DayEvent, GameState } from '@fc/engine';
import type { Arrow } from './components/Board.tsx';

/** Where each unit went on a resolved day, who fell, and both sides' order arrows. */
export function dayMotion(before: GameState, events: DayEvent[]) {
  const moved = before.pos.slice();
  const clashed = new Set<number>(), shot = new Set<number>();
  const arrows: Arrow[] = [], clashSquares: number[] = [], shots: { key: number; from: number; to: number }[] = [];
  events.forEach((e, i) => {
    if (e.type === 'move') {
      moved[e.unit] = e.to;
      arrows.push({ key: i, from: e.from, to: e.to, side: e.side, ok: true });
    } else if (e.type === 'rejected') {
      arrows.push({ key: i, from: e.order.from, to: e.order.to, side: e.side, ok: false });
    } else if (e.type === 'confrontation') {
      e.removed.forEach((u) => clashed.add(u));
      clashSquares.push(e.square);
    } else if (e.type === 'artillery') {
      shot.add(e.target);
      shots.push({ key: i, from: e.gun, to: e.target }); // unit ids; mapped to squares when drawn
    }
  });
  return { moved, clashed, shot, arrows, clashSquares, shots };
}
