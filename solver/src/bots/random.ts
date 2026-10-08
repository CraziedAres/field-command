import { randomDeployment, randomOrders } from '@fc/engine';
import type { Bot } from './types.ts';

/** Random legal-range orders and a random deployment: the baseline every other bot must beat. */
export const randomBot: Bot = {
  name: 'random',
  deploy: (side, rng) => randomDeployment(rng, side),
  orders: (state, side, rng) => randomOrders(rng, state, side),
};
