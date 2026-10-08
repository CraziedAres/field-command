import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRng, deserializeState, randomDeployment, randomOrders, resolveDay, serializeState, type Order,
} from '@fc/engine';
import { addPush, awaiting, deploy, join, newRoom, seatOf, submitOrders, viewFor, type Room } from '../src/room.ts';

function setup(seed = 1) {
  const rng = createRng(seed);
  const room = newRoom('ABC234', 'blue', 'tok-blue', 'https://example.test');
  assert.equal(join(room, 'tok-red'), 'red');
  return { room, rng, blue: randomDeployment(rng, 'blue'), red: randomDeployment(rng, 'red') };
}

function deployed(seed = 1) {
  const s = setup(seed);
  deploy(s.room, 'blue', s.blue);
  deploy(s.room, 'red', s.red);
  return s;
}

const ordersFor = (room: Room, rng: ReturnType<typeof createRng>, side: 'blue' | 'red'): Order[] =>
  randomOrders(rng, deserializeState(room.state!), side);

test('seats: creator, joiner, then full; tokens identify the side', () => {
  const { room } = setup();
  assert.throws(() => join(room, 'tok-3'), /two players/);
  assert.equal(seatOf(room, 'tok-blue'), 'blue');
  assert.equal(seatOf(room, 'tok-red'), 'red');
  assert.throws(() => seatOf(room, 'nope'), /Not a player/);
  assert.throws(() => seatOf(room, ''), /Not a player/);
});

test("a player's view never contains the opponent's deployment before both have deployed", () => {
  const { room, blue, red } = setup();
  deploy(room, 'red', red);
  const view = viewFor(room, 'blue');
  assert.equal(view.opponentDeployed, true);
  assert.equal(view.initial, null);
  assert.equal(view.myDeployment, null);
  // No red placement appears anywhere in Blue's view.
  const text = JSON.stringify(view);
  for (const square of Object.keys(red)) assert.ok(!text.includes(`"${square}"`), square);
  assert.equal(viewFor(room, 'red').myDeployment?.K1, red.K1);

  deploy(room, 'blue', blue);
  const after = viewFor(room, 'blue');
  assert.equal(after.phase, 'orders');
  assert.ok(after.initial); // once both are in, the whole board is public
});

test("a player's view never contains the opponent's pending orders", () => {
  const { room, rng } = deployed();
  const red = ordersFor(room, rng, 'red');
  submitOrders(room, 'red', 1, red);
  const view = viewFor(room, 'blue');
  assert.equal(view.opponentSubmitted, true);
  assert.equal(view.myOrders, null);
  assert.deepEqual(view.history, []);
  assert.ok(!JSON.stringify(view).includes('pending'));
  assert.deepEqual(viewFor(room, 'red').myOrders, red);
});

test('a day resolves when both orders are in; orders can be replaced until then', () => {
  const { room, rng } = deployed(2);
  const first = ordersFor(room, rng, 'blue');
  const second = ordersFor(room, rng, 'blue');
  assert.equal(submitOrders(room, 'blue', 1, first), false);
  assert.equal(submitOrders(room, 'blue', 1, second), false);
  const red = ordersFor(room, rng, 'red');
  assert.equal(submitOrders(room, 'red', 1, red), true);
  assert.equal(room.state!.day, 1);
  assert.deepEqual(room.history, [{ blue: second, red }]);
  assert.deepEqual(viewFor(room, 'blue').history, [{ blue: second, red }]);
  assert.throws(() => submitOrders(room, 'blue', 1, []), /day 2, not day 1/);
});

test('replaying the history from the initial state reproduces the server state', () => {
  const { room, rng } = deployed(3);
  for (let d = 1; d <= 25 && !room.state!.result; d++) {
    submitOrders(room, 'blue', d, ordersFor(room, rng, 'blue'));
    submitOrders(room, 'red', d, ordersFor(room, rng, 'red'));
  }
  const view = viewFor(room, 'red');
  let state = deserializeState(view.initial!);
  for (const orders of view.history) state = resolveDay(state, orders).state;
  assert.deepEqual(serializeState(state), room.state);
});

test('awaiting tells whose move it is', () => {
  const { room, rng, blue, red } = setup(4);
  assert.deepEqual([awaiting(room, 'blue'), awaiting(room, 'red')], [true, true]);
  deploy(room, 'blue', blue);
  assert.deepEqual([awaiting(room, 'blue'), awaiting(room, 'red')], [false, true]);
  deploy(room, 'red', red);
  assert.deepEqual([awaiting(room, 'blue'), awaiting(room, 'red')], [true, true]);
  submitOrders(room, 'red', 1, ordersFor(room, rng, 'red'));
  assert.deepEqual([awaiting(room, 'blue'), awaiting(room, 'red')], [true, false]);
  const solo = newRoom('XYZ789', 'blue', 't', 'https://example.test');
  assert.equal(awaiting(solo, 'red'), false); // no one in that seat yet
});

test('bad input is rejected without changing the room', () => {
  const { room, blue, red } = setup(5);
  assert.throws(() => submitOrders(room, 'blue', 1, []), /deploy first/);
  assert.throws(() => deploy(room, 'blue', red), /outside the blue deployment zone/);
  assert.throws(() => deploy(room, 'blue', null), /Invalid deployment/);
  assert.throws(() => deploy(room, 'blue', [1, 2]), /Invalid deployment/);
  deploy(room, 'blue', blue);
  assert.throws(() => deploy(room, 'blue', blue), /already deployed/);
  deploy(room, 'red', red);
  assert.throws(() => deploy(room, 'red', red), /Deployment is over/);
  const thirteen = Array.from({ length: 13 }, () => ({ from: 0, to: 11 }));
  assert.throws(() => submitOrders(room, 'blue', 1, thirteen), /at most 12/);
  assert.throws(() => submitOrders(room, 'blue', 1, [{ from: 0, to: 500 }]), /Invalid order/);
  assert.throws(() => submitOrders(room, 'blue', 1, 'A1-A2'), /at most 12/);
  assert.equal(room.pending.blue, undefined);
  assert.throws(() => newRoom('Q', 'blue', 't', 'o', 0), /day limit/);
});

test('push subscriptions: https only, de-duplicated, at most five', () => {
  const { room } = setup();
  assert.throws(() => addPush(room, 'blue', { endpoint: 'http://insecure' }), /Invalid push/);
  for (let i = 0; i < 7; i++) addPush(room, 'blue', { endpoint: `https://push.test/${i % 6}` });
  addPush(room, 'blue', { endpoint: 'https://push.test/5' });
  assert.equal(room.seats.blue!.push.length, 5);
  assert.equal(new Set(room.seats.blue!.push.map((p) => p.endpoint)).size, 5);
});

test('a day limit ends the game in a draw', () => {
  const room = newRoom('LIM234', 'blue', 'b', 'https://example.test', 1);
  join(room, 'r');
  const rng = createRng(9);
  deploy(room, 'blue', randomDeployment(rng, 'blue'));
  deploy(room, 'red', randomDeployment(rng, 'red'));
  submitOrders(room, 'blue', 1, []);
  submitOrders(room, 'red', 1, []);
  assert.equal(viewFor(room, 'blue').phase, 'over');
  assert.deepEqual(viewFor(room, 'blue').result, { winner: null, reason: 'max-days' });
});
