import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A_WINS, B_WINS, BOTH, KINDS, combat } from '../src/index.ts';

// Row kind vs column kind, order GEN ART INF1 INF2 INF3 CAV1 CAV2 CAV3 GUE.
// '>' row wins, '<' column wins, '=' both removed. Written out by hand from the rules sheet.
const FOREST = [
  '=<<<<<<<<', // GEN
  '>=<<<<<<<', // ART
  '>>=><>>>>', // INF1
  '>><=>>>>>', // INF2
  '>>><=>>>>', // INF3
  '>><<<=><<', // CAV1
  '>><<<<=><', // CAV2
  '>><<<><=<', // CAV3
  '>><<<>>>=', // GUE
];
const OPEN = [
  '=<<<<<<<<', // GEN
  '>=<<<<<<<', // ART
  '>>=><<<<<', // INF1
  '>><=><<<<', // INF2
  '>>><=<<<<', // INF3
  '>>>>>=><>', // CAV1
  '>>>>><=>>', // CAV2
  '>>>>>><=>', // CAV3
  '>>>>><<<=', // GUE
];
const CODE = { '>': A_WINS, '<': B_WINS, '=': BOTH } as const;

for (const [terrain, table] of [['forest', FOREST], ['open', OPEN]] as const) {
  test(`every confrontation pairing on ${terrain}`, () => {
    KINDS.forEach((a, i) =>
      KINDS.forEach((b, j) => {
        const expected = CODE[table[i][j] as keyof typeof CODE];
        assert.equal(combat(i, j, terrain === 'forest'), expected, `${a} vs ${b} on ${terrain}`);
      }),
    );
  });
}

test('tables are antisymmetric (a vs b mirrors b vs a)', () => {
  const flip = { '>': '<', '<': '>', '=': '=' } as Record<string, string>;
  for (const table of [FOREST, OPEN])
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) assert.equal(table[i][j], flip[table[j][i]]);
});
