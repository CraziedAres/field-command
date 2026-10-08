import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, artilleryRange, inRange, parseOrders, resolveDay, sq, type GameState } from '../src/index.ts';
import { position, snapshot } from './helpers.ts';

const day = (state: GameState, blue = '', red = '') => resolveDay(state, { blue: parseOrders(blue), red: parseOrders(red) });

test('range by target elevation relative to the gun', () => {
  assert.equal(artilleryRange(3, 1), 3); // 2 below
  assert.equal(artilleryRange(3, 2), 2); // 1 below
  assert.equal(artilleryRange(2, 1), 2);
  assert.equal(artilleryRange(2, 2), 1); // same level
  assert.equal(artilleryRange(1, 2), 0); // above
  assert.equal(artilleryRange(1, 3), 0);
});

test('range at each elevation difference on the real board', () => {
  const hits = (gun: string, target: string) => inRange(BOARD, sq(gun), sq(target));
  // A8 is elevation 3.
  assert.ok(hits('A8', 'D8')); // 2 below, distance 3
  assert.ok(!hits('A8', 'C10')); // 2 below, distance 4
  assert.ok(hits('A8', 'A9')); // 1 below, distance 1
  assert.ok(!hits('A8', 'A11')); // 1 below, distance 3
  assert.ok(!hits('A8', 'A6')); // same level, distance 2
  // F7 and F8 are both elevation 2.
  assert.ok(hits('F7', 'F8'));
  // F3 is elevation 1, F4 is 2: a target above can't be hit, even adjacent.
  assert.ok(!hits('F3', 'F4'));
  assert.ok(!hits('A8', 'A8')); // never its own square
});

test('guns remove every enemy in range except guerrillas, and never friendly units', () => {
  const state = position({
    blue: { A8: 'ART', A9: 'INF2' },
    red: { A10: 'INF1', B10: 'CAV3', C9: 'GUE', D8: 'ART', C10: 'INF2' },
  });
  const { state: next } = day(state);
  assert.deepEqual(snapshot(next).red, { K11: 'GEN', C9: 'GUE', C10: 'INF2' });
  assert.equal(snapshot(next).blue.A9, 'INF2');
});

test('guns in range of each other all fire at once (footnote 3)', () => {
  const state = position({ blue: { F7: 'ART' }, red: { F8: 'ART' } });
  const { state: next, events } = day(state);
  assert.deepEqual(snapshot(next), { blue: { A1: 'GEN' }, red: { K11: 'GEN' } });
  assert.equal(events.filter((e) => e.type === 'artillery').length, 2);
});

test('a gun removed in a confrontation does not fire', () => {
  const state = position({ blue: { A8: 'ART' }, red: { B8: 'INF2', A9: 'INF3' } });
  const { state: next } = day(state, '', 'B8-A8');
  assert.deepEqual(snapshot(next).red, { K11: 'GEN', A8: 'INF2', A9: 'INF3' });
});

test('a gun that moved fires from its new square', () => {
  // From B8 (elevation 2) A10 (elevation 1) at distance 3 is out of range; from A8 (3) it is in range.
  const state = position({ blue: { B8: 'ART' }, red: { A10: 'INF2' } });
  assert.equal(snapshot(day(state).state).red.A10, 'INF2');
  assert.equal(snapshot(day(state, 'B8-A8').state).red.A10, undefined);
});

test('a gun beats a General in a confrontation, then fires', () => {
  // E5 is elevation 2 and E4 elevation 1, so the surviving gun then hits E4.
  const state = position({ blue: { E5: 'ART' }, red: { F5: 'GEN', E4: 'INF2' } });
  const { state: next, events } = day(state, '', 'F5-E5');
  assert.deepEqual(next.result, { winner: 'blue', reason: 'general' });
  assert.ok(events.some((e) => e.type === 'artillery'));
  assert.equal(next.pos.includes(sq('E4')), false);
});

test('artillery fire on a General wins the game', () => {
  const state = position({ blue: { A8: 'ART' }, red: { D8: 'GEN' } });
  assert.deepEqual(day(state).state.result, { winner: 'blue', reason: 'general' });
});
