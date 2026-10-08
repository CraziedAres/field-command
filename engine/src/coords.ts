/** Squares are indexed 0..120: index = row * 11 + (column - 1), row 0 = A. */
export const SIZE = 11;
export const SQUARES = SIZE * SIZE;
export const ROWS = 'ABCDEFGHIJK';

export const rowOf = (sq: number): number => Math.floor(sq / SIZE);
export const colOf = (sq: number): number => sq % SIZE;

export function isSquare(sq: number): boolean {
  return Number.isInteger(sq) && sq >= 0 && sq < SQUARES;
}

/** Parse a square name such as "A8" (row A, column 8). Throws on invalid names. */
export function sq(name: string): number {
  const m = /^([A-Ka-k])(\d{1,2})$/.exec(name.trim());
  const col = m ? Number(m[2]) : 0;
  if (!m || col < 1 || col > SIZE) throw new Error(`Invalid square: ${name}`);
  return ROWS.indexOf(m[1].toUpperCase()) * SIZE + col - 1;
}

export function squareName(sq: number): string {
  return `${ROWS[rowOf(sq)]}${colOf(sq) + 1}`;
}

/** Orthogonal (Manhattan) distance: a diagonal step costs 2. */
export function dist(a: number, b: number): number {
  return Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b));
}

/** The square seen from the other side of the board (180° rotation). */
export const rotate180 = (sq: number): number => SQUARES - 1 - sq;
