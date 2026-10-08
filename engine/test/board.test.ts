import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, SQUARES, artilleryTargets, rotate180, sq, squareName } from '../src/index.ts';

// Transcribed from the owner's sketch (elevation + g forest / s open), row K at top, columns 1→11.
const EXPECTED = `
K 2s 1s 2s 3s 2s 3s 2s 1g 2g 1g 1g
J 1s 1g 1s 2s 1g 2s 3g 2g 1g 2g 1g
I 2g 1s 1g 1g 2s 1g 2g 3s 2g 1s 2g
H 3g 2s 1s 1s 2g 2g 1g 2g 3s 2g 1g
G 2s 1g 1g 2s 3g 2g 2g 1g 2s 3g 2g
F 3g 2s 1g 2g 2g 3g 2g 2g 1g 2s 3g
E 2g 3g 2s 1g 2g 2g 3g 2s 1g 1g 2s
D 1g 2g 3s 2g 1g 2g 2g 1s 1s 2s 3g
C 2g 1s 2g 3s 2g 1g 2s 1g 1g 1s 2g
B 1g 2g 1g 2g 3g 2s 1g 2s 1s 1g 1s
A 1g 1g 2g 1g 2s 3s 2s 3s 2s 1s 2s`;

test('board.json matches the transcribed sketch', () => {
  for (const line of EXPECTED.trim().split('\n')) {
    const [row, ...cells] = line.split(' ');
    cells.forEach((cell, i) => {
      const s = sq(`${row}${i + 1}`);
      assert.equal(`${BOARD.elevation[s]}${BOARD.forest[s] ? 'g' : 's'}`, cell, `${row}${i + 1}`);
    });
  }
});

test('board is symmetric under 180° rotation', () => {
  for (let s = 0; s < SQUARES; s++) {
    assert.equal(BOARD.elevation[s], BOARD.elevation[rotate180(s)], squareName(s));
    assert.equal(BOARD.forest[s], BOARD.forest[rotate180(s)], squareName(s));
  }
  assert.deepEqual([...BOARD.zone.red].sort((a, b) => a - b), BOARD.zone.blue.map(rotate180).sort((a, b) => a - b));
});

test('deployment zones are 11/11/8/6/4 and include the A1 / K11 corners', () => {
  const perRow = (zone: readonly number[]) => {
    const counts: Record<string, number> = {};
    for (const s of zone) counts[squareName(s)[0]] = (counts[squareName(s)[0]] ?? 0) + 1;
    return counts;
  };
  assert.deepEqual(perRow(BOARD.zone.blue), { A: 11, B: 11, C: 8, D: 6, E: 4 });
  assert.deepEqual(perRow(BOARD.zone.red), { K: 11, J: 11, I: 8, H: 6, G: 4 });
  for (const s of ['C8', 'D6', 'E4']) assert.ok(BOARD.zone.blue.includes(sq(s)), s);
  for (const s of ['C9', 'D7', 'E5']) assert.ok(!BOARD.zone.blue.includes(sq(s)), s);
});

test('rulebook artillery examples hit exactly the listed squares', () => {
  const cases: [string, string][] = [
    ['A8', 'A7 A9 A10 B7 B8 B9 B10 C8 C9 D8'],
    ['G4', 'E4 F3 F4 G2 G3 H3 H4 I4'],
    ['F3', 'G3'],
  ];
  for (const [gun, expected] of cases) {
    const hits = artilleryTargets(BOARD, sq(gun)).map(squareName).sort();
    assert.deepEqual(hits, expected.split(' ').sort(), gun);
  }
});
