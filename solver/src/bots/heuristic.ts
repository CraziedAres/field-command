/**
 * One-day lookahead heuristic. Each unit scores every square it can reach by what could happen there
 * tomorrow, assuming the enemy might move anywhere in range:
 *  - risk: enemy units that could reach the square and would beat this unit there (terrain-aware), and
 *    enemy gun coverage (now, or after a gun's one-square move);
 *  - attack: an enemy unit standing on the square that this unit beats (it may move away, so discounted);
 *  - artillery: enemy units a gun on that square would hit;
 *  - pressure: fighters close in on the enemy General; the General keeps away from anything that can reach it.
 * When enemy units can reach the General, it sidesteps and a bodyguard that beats those raiders on that
 * terrain takes its old square (units jump, so the General can't be shielded, only swapped out).
 * The best-improving moves (up to 12) are then taken greedily, never sending two units to one square.
 */
import {
  ARMY, ART, A_WINS, BOARD, BOTH, B_WINS, GEN, GUE, KINDS, MAX_ORDERS, MOVE, SQUARES,
  combat, dist, opponent, rowOf, shuffle, squareName,
  type Deployment, type GameState, type Kind, type Order, type Rng, type Side,
} from '@fc/engine';
import { TARGETS, VALUE, alive, generalSquare, gunCover, isFighter, occupancy, reach, within } from './features.ts';
import type { Bot } from './types.ts';

export interface HeuristicParams {
  /** Random noise added to every score (0 = deterministic); used for variety. */
  noise: number;
  /** Weight on closing in on the enemy General. */
  aggression: number;
  /** Weight on risk. */
  caution: number;
  /** 1 = sidestep the General and drop a bodyguard when raiders can reach it; 0 = don't. */
  guard: number;
}

export const DEFAULT_HEURISTIC: HeuristicParams = { noise: 0, aggression: 1, caution: 1, guard: 1 };

const GENERAL_VALUE = 200;
/** Chance an enemy unit that could reach a square actually ends there. */
const P_ARRIVE = 0.3;
const P_ARRIVE_ON_GENERAL = 0.7;
/** Chance an enemy unit stays where it is (so an attack on its square connects). */
const P_STAYS = 0.6;

export function heuristicOrders(state: GameState, side: Side, rng: Rng, p: HeuristicParams = DEFAULT_HEURISTIC): Order[] {
  const foe = opponent(side);
  const { kind, pos } = state;
  const foeReach = reach(state, foe);
  const foeGuns = gunCover(state, foe);
  const occ = occupancy(state);
  const foeGen = generalSquare(state, foe);
  const isFoe = (u: number) => u >= 0 && (side === 'blue' ? u >= 40 : u < 40);

  function score(u: number, s: number): number {
    const k = kind[u];
    const forest = BOARD.forest[s] === 1;
    const worth = k === GEN ? GENERAL_VALUE : VALUE[k];
    let v = 0;

    // Risk from enemy units that could end on this square (an enemy already there is the attack case).
    let survive = 1;
    for (const e of foeReach[s]) {
      if (e === occ[s]) continue;
      if (combat(kind[e], k, forest) !== B_WINS) survive *= 1 - (k === GEN ? P_ARRIVE_ON_GENERAL : P_ARRIVE);
    }
    v -= (1 - survive) * worth * p.caution;
    if (k !== GUE) v -= (foeGuns.now[s] ? 0.8 : foeGuns.next[s] ? 0.4 : 0) * worth * p.caution;

    // Attack whatever is standing on the square now.
    const e = occ[s];
    if (isFoe(e) && s !== pos[u]) {
      const o = combat(k, kind[e], forest);
      const theirs = kind[e] === GEN ? 2 * GENERAL_VALUE : VALUE[kind[e]];
      v += P_STAYS * (o === A_WINS ? theirs : o === BOTH ? theirs - worth : -worth);
    }

    if (k === ART) {
      for (const t of TARGETS[s]) {
        const target = occ[t];
        if (isFoe(target) && kind[target] !== GUE) v += 0.5 * (kind[target] === GEN ? GENERAL_VALUE / 4 : VALUE[kind[target]]);
      }
    } else if (isFighter(k) && foeGen >= 0) {
      v -= 0.08 * p.aggression * dist(s, foeGen);
      if (dist(s, foeGen) <= MOVE[k]) v += 1.5 * p.aggression; // threatens the General tomorrow
    }
    return v + (p.noise ? (rng() - 0.5) * p.noise : 0);
  }

  const orders: Order[] = [];
  const taken = new Uint8Array(SQUARES);
  for (const u of alive(state, side)) taken[pos[u]] = 1;
  const committed = new Set<number>();
  const commit = (u: number, to: number) => {
    taken[pos[u]] = 0;
    taken[to] = 1;
    committed.add(u);
    orders.push({ from: pos[u], to });
  };
  if (p.guard) guardGeneral();

  // Best few improving destinations per unit.
  type Option = { s: number; gain: number };
  const plans: { u: number; options: Option[] }[] = [];
  for (const u of alive(state, side)) {
    if (committed.has(u)) continue;
    const stay = score(u, pos[u]);
    const options: Option[] = [];
    for (const s of within(pos[u], MOVE[kind[u]])) {
      if (s === pos[u]) continue;
      const gain = score(u, s) - stay;
      if (gain > 0.05) options.push({ s, gain });
    }
    if (options.length) plans.push({ u, options: options.sort((a, b) => b.gain - a.gain).slice(0, 4) });
  }
  plans.sort((a, b) => b.options[0].gain - a.options[0].gain);

  // Greedy, keeping every final square unique so the engine accepts every order.
  let pending = plans;
  for (let pass = 0; pass < 2 && orders.length < MAX_ORDERS; pass++) {
    const retry: typeof plans = [];
    for (const plan of pending) {
      if (orders.length >= MAX_ORDERS) break;
      const pick = plan.options.find((o) => !taken[o.s]);
      if (!pick) {
        retry.push(plan);
        continue;
      }
      taken[pos[plan.u]] = 0;
      taken[pick.s] = 1;
      orders.push({ from: pos[plan.u], to: pick.s });
    }
    pending = retry;
  }
  return orders;

  /**
   * When raiders can reach the General, leave the square they're aiming at. Whoever takes the old square
   * absorbs the attack: ideally a bodyguard that beats the raiders on that terrain. Every deployment
   * square is filled, so the General usually has to swap with a neighbour rather than step into a gap.
   */
  function guardGeneral() {
    const general = alive(state, side).find((u) => kind[u] === GEN);
    if (general === undefined) return;
    const g = pos[general];
    const raiders = foeReach[g];
    if (!raiders.length) return;
    const forest = BOARD.forest[g] === 1;
    const beats = (u: number) => raiders.filter((e) => combat(kind[u], kind[e], forest) === A_WINS).length;
    const danger = (s: number) => foeReach[s].length + foeGuns.next[s];
    const occupant = new Map(alive(state, side).map((u) => [pos[u], u]));

    // Option: step to a neighbour; if a friend is there, it swaps onto the General's square.
    let best: { to: number; partner: number; score: number } | null = null;
    for (const s of within(g, 1)) {
      if (s === g) continue;
      const partner = occupant.get(s) ?? -1;
      const score = -danger(s) + (partner >= 0 ? 0.5 * beats(partner) : 0);
      if (!best || score > best.score) best = { to: s, partner, score };
    }
    if (!best) return;
    commit(general, best.to);
    if (best.partner >= 0) {
      commit(best.partner, g);
      taken[best.to] = 1; // the partner's old square is now the General's
      return;
    }
    // Stepped into a gap: send the best available bodyguard onto the vacated square.
    let guard = -1, guardScore = 0;
    for (const u of alive(state, side)) {
      if (committed.has(u) || !isFighter(kind[u]) || dist(pos[u], g) > MOVE[kind[u]]) continue;
      const sc = beats(u) - 0.01 * VALUE[kind[u]];
      if (beats(u) > 0 && sc > guardScore) [guard, guardScore] = [u, sc];
    }
    if (guard >= 0) commit(guard, g);
  }
}

/**
 * Deployment: the General in the back rows, guns on high ground, infantry in forest and cavalry in the
 * open towards the front, guerrillas screening the front. Noise varies it between games.
 */
export function heuristicDeployment(side: Side, rng: Rng, noise = 1): Deployment {
  const zone = [...BOARD.zone[side]];
  const depth = (s: number) => (side === 'blue' ? rowOf(s) : 10 - rowOf(s)); // 0 = home edge, 4 = front
  const pref: Record<string, (s: number) => number> = {
    GEN: (s) => -3 * depth(s) - 0.4 * Math.abs((s % 11) - 5),
    ART: (s) => 2 * BOARD.elevation[s] + 0.6 * depth(s),
    GUE: (s) => 1.5 * depth(s),
    CAV: (s) => 2 * (1 - BOARD.forest[s]) + 0.8 * depth(s),
    INF: (s) => 2 * BOARD.forest[s] + 0.8 * depth(s),
  };
  const order: Kind[] = ['GEN', 'ART', 'GUE', 'CAV1', 'CAV2', 'CAV3', 'INF1', 'INF2', 'INF3'];
  const dep: Deployment = {};
  const free = new Set(zone);
  for (const k of order) {
    const f = pref[k.replace(/\d$/, '')];
    for (let n = 0; n < ARMY[KINDS.indexOf(k)]; n++) {
      let best = -1, bestScore = -Infinity;
      for (const s of shuffle(rng, [...free])) {
        const sc = f(s) + (rng() - 0.5) * noise * 2;
        if (sc > bestScore) [best, bestScore] = [s, sc];
      }
      free.delete(best);
      dep[squareName(best)] = k;
    }
  }
  return dep;
}

export function heuristicBot(params: Partial<HeuristicParams> = {}, name = 'heuristic'): Bot {
  const p = { ...DEFAULT_HEURISTIC, ...params };
  return {
    name,
    deploy: (side, rng) => heuristicDeployment(side, rng),
    orders: (state, side, rng) => heuristicOrders(state, side, rng, p),
  };
}
