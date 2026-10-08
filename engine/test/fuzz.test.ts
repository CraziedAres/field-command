import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEN, MOVE, UNITS_PER_SIDE, createGame, createRng, dist, randomDeployment, randomOrders, resolveDay, type GameState,
} from '../src/index.ts';

function playRandomGame(seed: number, check?: (prev: GameState, next: GameState) => void): GameState {
  const rng = createRng(seed);
  let state = createGame(randomDeployment(rng, 'blue'), randomDeployment(rng, 'red'));
  while (!state.result) {
    const orders = { blue: randomOrders(rng, state, 'blue'), red: randomOrders(rng, state, 'red') };
    const next = resolveDay(state, orders, { maxDays: 150 }).state;
    check?.(state, next);
    state = next;
  }
  return state;
}

test('random games keep the invariants', () => {
  for (let seed = 1; seed <= 300; seed++) {
    playRandomGame(seed, (prev, next) => {
      const occupied = new Set<number>();
      next.pos.forEach((p, u) => {
        if (p < 0) return;
        assert.ok(!occupied.has(p), `seed ${seed}: two units on one square after day ${next.day}`);
        occupied.add(p);
        assert.ok(prev.pos[u] >= 0, `seed ${seed}: removed unit came back`);
        assert.ok(dist(prev.pos[u], p) <= MOVE[next.kind[u]], `seed ${seed}: unit ${u} moved too far`);
      });
      const generals = [0, UNITS_PER_SIDE].map((first) =>
        next.pos.some((p, u) => u >= first && u < first + UNITS_PER_SIDE && next.kind[u] === GEN && p >= 0),
      );
      if (!generals[0] || !generals[1]) {
        assert.equal(next.result?.reason, 'general');
        assert.equal(next.result?.winner, generals[0] ? 'blue' : generals[1] ? 'red' : null);
      }
    });
  }
});

test('games are deterministic for a seed', () => {
  for (const seed of [7, 42, 1234]) {
    const a = playRandomGame(seed);
    const b = playRandomGame(seed);
    assert.deepEqual([a.day, a.result, [...a.pos]], [b.day, b.result, [...b.pos]]);
  }
});
