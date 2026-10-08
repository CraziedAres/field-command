import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, resolveDay, validateDeployment, MAX_ORDERS } from '@fc/engine';
import { makeBot, playGame, solveMatrix, stream } from '../src/index.ts';

const SPECS = ['random', 'heuristic', 'heuristic:noise=2,guard=0', 'regret:candidates=4,opponentCandidates=4,iterations=100'];

test('every bot deploys legally for both sides', () => {
  for (const spec of SPECS) {
    const bot = makeBot(spec);
    for (let seed = 1; seed <= 5; seed++)
      for (const side of ['blue', 'red'] as const) assert.deepEqual(validateDeployment(side, bot.deploy(side, stream(seed, 0))), [], `${spec} ${side}`);
  }
});

test('heuristic and regret orders are never rejected by the engine', () => {
  for (const spec of ['heuristic', 'heuristic:noise=3', 'regret:candidates=4,opponentCandidates=4,iterations=100']) {
    for (let seed = 1; seed <= (spec.startsWith('regret') ? 2 : 15); seed++) {
      const bot = makeBot(spec), foe = makeBot('heuristic');
      const rb = stream(seed, 1), rr = stream(seed, 2);
      let state = createGame(bot.deploy('blue', rb), foe.deploy('red', rr));
      while (!state.result) {
        const orders = { blue: bot.orders(state, 'blue', rb), red: foe.orders(state, 'red', rr) };
        assert.ok(orders.blue.length <= MAX_ORDERS && orders.red.length <= MAX_ORDERS);
        const { state: next, events } = resolveDay(state, orders, { maxDays: 60 });
        const rejected = events.filter((e) => e.type === 'rejected');
        assert.deepEqual(rejected, [], `${spec}, seed ${seed}, day ${next.day}`);
        state = next;
      }
    }
  }
});

test('games are reproducible from their seed', () => {
  for (const spec of ['random', 'heuristic:noise=1', 'regret:candidates=3,opponentCandidates=3,iterations=50']) {
    const a = playGame(makeBot(spec), makeBot('heuristic:noise=1'), { seed: 7, maxDays: 40 });
    const b = playGame(makeBot(spec), makeBot('heuristic:noise=1'), { seed: 7, maxDays: 40 });
    assert.deepEqual(a, b, spec);
  }
});

test('regret matching finds the equilibrium of small matrix games', () => {
  const pennies = solveMatrix([[1, -1], [-1, 1]], 2000);
  assert.ok(Math.abs(pennies[0] - 0.5) < 0.05, `matching pennies: ${pennies}`);
  const dominated = solveMatrix([[1, 1], [0, 0], [2, -1]], 2000);
  assert.ok(dominated[1] < 0.02, `dominated row gets ~0: ${dominated}`);
  const rps = solveMatrix([[0, -1, 1], [1, 0, -1], [-1, 1, 0]], 5000);
  for (const p of rps) assert.ok(Math.abs(p - 1 / 3) < 0.05, `rock-paper-scissors: ${rps}`);
});

test('strength ordering: heuristic beats random; the bodyguard defence beats no defence', () => {
  const score = (a: string, b: string, n: number) => {
    let s = 0;
    for (let seed = 1; seed <= n; seed++) {
      for (const [blue, red] of [[a, b], [b, a]]) {
        const r = playGame(makeBot(blue), makeBot(red), { seed, maxDays: 100 });
        s += r.winner === null ? 0.5 : r[r.winner] === a ? 1 : 0;
      }
    }
    return s / (2 * n);
  };
  assert.ok(score('heuristic', 'random', 15) > 0.9);
  assert.ok(score('heuristic', 'heuristic:guard=0', 15) > 0.75);
});

test('bad bot specs fail clearly', () => {
  assert.throws(() => makeBot('genius'), /Unknown bot/);
  assert.throws(() => makeBot('heuristic:noise=lots'), /Bad bot parameter/);
});
