import { sq, squareName } from './coords.ts';
import type { Order } from './orders.ts';

/** Parse orders written like the rulebook: "E4-G4 D5-F5" (comma, space or newline separated). */
export function parseOrders(text: string): Order[] {
  return text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((o) => {
      const [from, to] = o.split(/-|→|>/);
      if (to === undefined) throw new Error(`Invalid order: ${o}`);
      return { from: sq(from), to: sq(to) };
    });
}

export const formatOrder = (o: Order): string => `${squareName(o.from)}-${squareName(o.to)}`;
