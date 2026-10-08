import { SIZE, colOf, rowOf, type Side } from '@fc/engine';

export const CELL = 100;
export const MARGIN = 44; // room for row letters (left) and column numbers (bottom)
export const BOARD_PX = CELL * SIZE;
export const VIEW_W = MARGIN + BOARD_PX;
export const VIEW_H = BOARD_PX + MARGIN;

/**
 * Screen grid position of a square. Each player sees their own edge at the bottom, as at the table:
 * Blue sees row A at the bottom with A1 bottom-right; Red sees the board turned 180°.
 */
export function gridOf(sq: number, view: Side): [number, number] {
  const r = rowOf(sq), c = colOf(sq);
  return view === 'blue' ? [SIZE - 1 - c, SIZE - 1 - r] : [c, r];
}

export function squareAtGrid(gx: number, gy: number, view: Side): number {
  const [c, r] = view === 'blue' ? [SIZE - 1 - gx, SIZE - 1 - gy] : [gx, gy];
  return r * SIZE + c;
}

export function topLeft(sq: number, view: Side): { x: number; y: number } {
  const [gx, gy] = gridOf(sq, view);
  return { x: MARGIN + gx * CELL, y: gy * CELL };
}

export function center(sq: number, view: Side): { x: number; y: number } {
  const { x, y } = topLeft(sq, view);
  return { x: x + CELL / 2, y: y + CELL / 2 };
}

/** The square under a screen point, or -1. */
export function clientToSquare(svg: SVGSVGElement, clientX: number, clientY: number, view: Side): number {
  const ctm = svg.getScreenCTM();
  if (!ctm) return -1;
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  const gx = Math.floor((p.x - MARGIN) / CELL), gy = Math.floor(p.y / CELL);
  if (gx < 0 || gy < 0 || gx >= SIZE || gy >= SIZE) return -1;
  return squareAtGrid(gx, gy, view);
}
