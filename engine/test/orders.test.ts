import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrders, resolveDay, resolveSideOrders, type GameState, type Kind } from '../src/index.ts';
import { position, snapshot } from './helpers.ts';

const blueOnly = (units: Record<string, Kind>) => position({ blue: units, red: {} });
const resolveBlue = (state: GameState, text: string) => resolveSideOrders(state, 'blue', parseOrders(text));
const rejections = (state: GameState, text: string) =>
  resolveBlue(state, text).rejected.map((r) => `${r.index}:${r.reason}`);
const after = (state: GameState, blue: string, red = '') =>
  snapshot(resolveDay(state, { blue: parseOrders(blue), red: parseOrders(red) }).state);

test('rulebook Sample Day 1: two orders to F5 cancel, and that blocks B5-D5', () => {
  const units: Record<string, Kind> = {};
  for (const s of 'E4 D5 C6 B5 B8 A7 E2 C2 E3 B10 B11'.split(' ')) units[s] = 'INF2';
  units.D4 = 'CAV2'; // D4-F5 is three positions, legal for cavalry
  const state = blueOnly(units);
  const sample = 'E4-G4 D5-F5 D4-F5 C6-E6 B5-D5 B8-C9 A7-B8 E2-G2 C2-E2 E3-G3 B10-D10 B11-D11';
  assert.deepEqual(rejections(state, sample), ['1:same-destination', '2:same-destination', '4:blocked']);
  const blue = after(state, sample).blue;
  for (const s of 'G4 D5 D4 E6 B5 C9 B8 G2 E2 G3 D10 D11'.split(' ')) assert.ok(blue[s], `unit on ${s}`);
  assert.equal(blue.F5, undefined);
});

test('distance is orthogonal: a diagonal step costs two', () => {
  const state = blueOnly({ B2: 'GEN', B5: 'ART', C5: 'INF1', D5: 'CAV1', E5: 'GUE' });
  assert.deepEqual(rejections(state, 'B2-C3'), ['0:too-far']); // General can't move diagonally
  assert.deepEqual(rejections(state, 'B5-C6'), ['0:too-far']); // nor can artillery
  assert.deepEqual(rejections(state, 'B2-B3 B5-B6'), []);
  assert.deepEqual(rejections(state, 'C5-D6'), []); // infantry: diagonal = 2
  assert.deepEqual(rejections(state, 'C5-E6'), ['0:too-far']);
  assert.deepEqual(rejections(state, 'D5-F6 E5-G6'), []); // cavalry and guerrillas: 3
  assert.deepEqual(rejections(state, 'D5-F7 E5-E9'), ['0:too-far', '1:too-far']);
});

test('units jump over friends and enemies', () => {
  const state = position({ blue: { C1: 'CAV1', C2: 'INF2' }, red: { C3: 'INF2', K1: 'INF3' } });
  assert.deepEqual(after(state, 'C1-C4').blue.C4, 'CAV1');
});

test('friendly swaps and cycles are legal', () => {
  const state = blueOnly({ C8: 'INF1', D9: 'INF2', B2: 'INF1', B3: 'INF2', B4: 'INF3' });
  assert.deepEqual(rejections(state, 'C8-D9 D9-C8 B2-B3 B3-B4 B4-B2'), []);
  const blue = after(state, 'C8-D9 D9-C8 B2-B3 B3-B4 B4-B2').blue;
  assert.deepEqual([blue.C8, blue.D9, blue.B2, blue.B3, blue.B4], ['INF2', 'INF1', 'INF3', 'INF1', 'INF2']);
});

test('moving onto a square its occupant leaves is legal', () => {
  assert.deepEqual(rejections(blueOnly({ C2: 'INF1', E2: 'INF2' }), 'C2-E2 E2-G2'), []);
});

test('two units ordered to one square: both stay (H7-F7 G8-F7)', () => {
  const state = blueOnly({ H7: 'INF1', G8: 'INF2' });
  assert.deepEqual(rejections(state, 'H7-F7 G8-F7'), ['0:same-destination', '1:same-destination']);
});

test('...unless only one of them is otherwise legal, which then executes (footnote 2)', () => {
  const state = blueOnly({ H7: 'ART', G8: 'INF2' }); // H7-F7 is too far for artillery
  assert.deepEqual(rejections(state, 'H7-F7 G8-F7'), ['0:too-far']);
  assert.equal(after(state, 'H7-F7 G8-F7').blue.F7, 'INF2');
});

test('one unit ordered twice: both orders are illegal (B7-B9 B7-C8)', () => {
  const state = blueOnly({ B7: 'INF1' });
  assert.deepEqual(rejections(state, 'B7-B9 B7-C8'), ['0:duplicate-unit', '1:duplicate-unit']);
  assert.equal(after(state, 'B7-B9 B7-C8').blue.B7, 'INF1');
});

test('...unless only one of them is otherwise legal (footnote 2)', () => {
  const state = blueOnly({ B7: 'INF1' });
  assert.deepEqual(rejections(state, 'B7-B9 B7-E9'), ['1:too-far']);
  assert.equal(after(state, 'B7-B9 B7-E9').blue.B9, 'INF1');
});

test('a friendly unit staying put blocks a move, and the block cascades', () => {
  // C1 has no order; C2->C1 is blocked, so C2 stays, which blocks C3->C2, which blocks C4->C3.
  const state = blueOnly({ C1: 'INF1', C2: 'INF2', C3: 'INF3', C4: 'INF2', C6: 'INF2' });
  assert.deepEqual(rejections(state, 'C2-C1 C3-C2 C4-C3 C6-C5'), ['0:blocked', '1:blocked', '2:blocked']);
});

test('a cascade started by a cancelled conflict reaches units that would otherwise move', () => {
  // D5 and D3 both want D4 (cancelled), so D5 stays; that blocks D6->D5, then D7->D6.
  const state = blueOnly({ D3: 'INF1', D5: 'INF2', D6: 'INF3', D7: 'INF2' });
  assert.deepEqual(rejections(state, 'D3-D4 D5-D4 D6-D5 D7-D6'), [
    '0:same-destination', '1:same-destination', '2:blocked', '3:blocked',
  ]);
});

test('orders from empty or enemy squares, off-board squares and beyond 12 are rejected', () => {
  const state = position({ blue: { B1: 'INF1' }, red: { B2: 'INF1' } });
  const orders = parseOrders('B3-B4 B2-B3');
  orders.push({ from: 12, to: 200 });
  assert.deepEqual(resolveSideOrders(state, 'blue', orders).rejected.map((r) => r.reason), ['no-unit', 'no-unit', 'off-board']);

  const twelveUnits: Record<string, Kind> = {};
  for (let c = 1; c <= 11; c++) twelveUnits[`B${c}`] = 'INF2';
  twelveUnits.C1 = 'INF2';
  twelveUnits.C2 = 'INF2';
  const many = blueOnly(twelveUnits);
  const text = [...Array(11).keys()].map((i) => `B${i + 1}-D${i + 1}`).join(' ') + ' C1-E1 C2-E2';
  assert.deepEqual(rejections(many, text), ['12:over-limit']);
});

test('opposing units that swap squares pass through each other without fighting', () => {
  const state = position({ blue: { E6: 'INF2' }, red: { F6: 'INF2' } });
  const { state: next, events } = resolveDay(state, { blue: parseOrders('E6-F6'), red: parseOrders('F6-E6') });
  assert.equal(events.filter((e) => e.type === 'confrontation').length, 0);
  assert.deepEqual(snapshot(next), { blue: { A1: 'GEN', F6: 'INF2' }, red: { K11: 'GEN', E6: 'INF2' } });
});

test('one side\'s legality ignores the other side\'s units', () => {
  // Blue may move onto a red unit (a confrontation), and red's blocked order doesn't affect blue.
  const state = position({ blue: { E6: 'INF2' }, red: { F6: 'INF1', F7: 'INF3' } });
  assert.deepEqual(rejections(state, 'E6-F6'), []);
});
