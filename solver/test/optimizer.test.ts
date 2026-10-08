import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMY, createRng, validateDeployment } from '@fc/engine';
import { bestResponse } from '../src/optimizer/bestResponse.ts';
import { head2head, match } from '../src/optimizer/evaluate.ts';
import { features } from '../src/optimizer/features.ts';
import { ZONE, fromDeployment, heuristicLayout, mutate, randomLayout, toDeployment } from '../src/optimizer/layout.ts';

const counts = (l: number[]) => ARMY.map((_, k) => l.filter((x) => x === k).length);
const EVAL = { policies: ['heuristic:noise=1'], maxDays: 60 };

test('layouts convert to legal deployments for both sides and back', () => {
  const rng = createRng(1);
  for (let i = 0; i < 10; i++) {
    const l = i % 2 ? randomLayout(rng) : heuristicLayout(rng);
    for (const side of ['blue', 'red'] as const) {
      const dep = toDeployment(l, side);
      assert.deepEqual(validateDeployment(side, dep), []);
      assert.deepEqual(fromDeployment(dep, side), l);
    }
  }
  assert.equal(ZONE.length, 40);
});

test('mutation swaps units without changing the army', () => {
  const rng = createRng(2);
  let l = heuristicLayout(rng);
  for (let i = 0; i < 200; i++) {
    const next = mutate(l, rng);
    assert.deepEqual(counts(next), [...ARMY]);
    assert.ok(next.some((k, j) => k !== l[j]));
    l = next;
  }
});

test('features describe the layout', () => {
  const l = heuristicLayout(createRng(3), 0);
  const f = features(l);
  assert.equal(f.generalDepth, 0); // the rule-of-thumb layout keeps the General on the home row
  assert.ok(f.generalRaidDays >= 2);
  assert.ok(f.infantryInForest >= 0 && f.infantryInForest <= 1);
});

test('matches are reproducible, alternate colours, and score symmetrically', () => {
  const rng = createRng(4);
  const a = heuristicLayout(rng), b = randomLayout(rng);
  assert.equal(match(a, b, 10, EVAL), match(a, b, 10, EVAL));
  assert.equal(match(a, b, 11, EVAL), 1 - match(b, a, 11, EVAL));
  assert.ok(head2head(a, b, 10, 1, EVAL) >= 0);
});

test('best response beats the opponent it was searched against', () => {
  const rng = createRng(5);
  const opponent = heuristicLayout(rng, 0);
  const br = bestResponse([opponent], [1], { ...EVAL, steps: 25, games: 12, seed: 9, pruneMargin: 1.5 });
  assert.deepEqual(counts(br.layout), [...ARMY]);
  assert.ok(br.searchScore >= 0.5, `search score ${br.searchScore}`);
  assert.ok(br.evaluated + br.pruned >= 25);
});
