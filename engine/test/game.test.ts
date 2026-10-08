import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, createRng, deserializeState, parseOrders, randomDeployment, resolveDay, serializeState, validateDeployment,
  type Deployment, type GameState,
} from '../src/index.ts';
import { position } from './helpers.ts';

const day = (state: GameState, blue = '', red = '', maxDays?: number) =>
  resolveDay(state, { blue: parseOrders(blue), red: parseOrders(red) }, { maxDays });

test('both Generals removed on the same day is a draw', () => {
  const state = position({ blue: { E5: 'GEN', E6: 'CAV1' }, red: { G5: 'GEN', G6: 'CAV1' } });
  const { state: next, events } = day(state, 'E6-G5', 'G6-E5');
  assert.deepEqual(next.result, { winner: null, reason: 'general' });
  assert.deepEqual(events.at(-1), { type: 'end', result: { winner: null, reason: 'general' } });
});

test('removing only the enemy General wins', () => {
  const state = position({ blue: { E5: 'GEN', F6: 'GUE' }, red: { G5: 'GEN' } });
  assert.deepEqual(day(state, 'F6-G5').state.result, { winner: 'blue', reason: 'general' });
});

test('General vs General removes both: a draw', () => {
  const state = position({ blue: { E5: 'GEN' }, red: { F5: 'GEN' } });
  assert.deepEqual(day(state, 'E5-F5').state.result, { winner: null, reason: 'general' });
});

test('reaching maxDays is a draw; resolving after the end throws', () => {
  let state = position({ blue: {}, red: {} });
  state = day(state, '', '', 2).state;
  assert.equal(state.result, null);
  state = day(state, '', '', 2).state;
  assert.deepEqual(state.result, { winner: null, reason: 'max-days' });
  assert.equal(state.day, 2);
  assert.throws(() => day(state));
});

test('resolveDay does not mutate its input', () => {
  const state = position({ blue: { E5: 'INF1' }, red: { F5: 'INF2' } });
  const before = state.pos.slice();
  day(state, 'E5-F5');
  assert.deepEqual(state.pos, before);
});

test('deployment validation', () => {
  const rng = createRng(1);
  const good = randomDeployment(rng, 'blue');
  assert.deepEqual(validateDeployment('blue', good), []);
  assert.ok(validateDeployment('red', good).length > 0); // blue squares are outside red's zone

  const wrongMix: Deployment = { ...good };
  const gun = Object.keys(wrongMix).find((s) => wrongMix[s] === 'ART')!;
  wrongMix[gun] = 'GUE';
  assert.deepEqual(validateDeployment('blue', wrongMix), ['ART: 4 placed, 5 required', 'GUE: 6 placed, 5 required']);

  const outside: Deployment = { ...good, F6: 'INF2' };
  assert.ok(validateDeployment('blue', outside).includes('F6: outside the blue deployment zone'));
  assert.throws(() => createGame(outside, randomDeployment(rng, 'red')));
});

test('createGame places all 80 units on their zone squares', () => {
  const rng = createRng(2);
  const blue = randomDeployment(rng, 'blue');
  const red = randomDeployment(rng, 'red');
  const state = createGame(blue, red);
  assert.equal(state.pos.filter((p) => p >= 0).length, 80);
  assert.equal(new Set(state.pos).size, 80);
});

test('serialized state round-trips through JSON', () => {
  const rng = createRng(3);
  const state = createGame(randomDeployment(rng, 'blue'), randomDeployment(rng, 'red'));
  const back = deserializeState(JSON.parse(JSON.stringify(serializeState(state))));
  assert.deepEqual(back, state);
});
