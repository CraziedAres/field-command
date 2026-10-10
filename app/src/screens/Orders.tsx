import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import {
  MAX_ORDERS, opponent, reachable, resolveSideOrders, sideOfUnit, squareName, threatMap, unitAt, KINDS,
  type GameState, type Order, type Side,
} from '@fc/engine';
import { Board, type Arrow, type Target, type UnitView } from '../components/Board.tsx';
import { Forces } from '../components/Forces.tsx';
import { UnitIcon } from '../components/Emblem.tsx';
import { Log } from './Log.tsx';
import { NAME, REASON, SIDE_NAME, kindOf, matchup, moveOf } from '../labels.ts';
import type { DayRecord } from '../store.ts';

type Overlay = 'off' | 'enemy' | 'own';

/**
 * Tap one of your units, then a highlighted square, to queue an order. Highlighted friendly squares are
 * order targets too (for swaps and chains); tap the selected unit again to clear its order and deselect.
 */
export function Orders({ state, side, history, onSubmit, initial = [], busy = false, extra }: {
  state: GameState; side: Side; history: DayRecord[]; onSubmit: (orders: Order[]) => void;
  initial?: Order[]; busy?: boolean; extra?: ComponentChildren;
}) {
  const [orders, setOrders] = useState<Order[]>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<Overlay>('off');
  const [notice, setNotice] = useState('');

  const preview = useMemo(() => resolveSideOrders(state, side, orders), [state, side, orders]);
  const problems = new Map(preview.rejected.map((r) => [r.index, r.reason]));

  const targets = useMemo(() => {
    const map = new Map<number, Target>();
    if (sel === null) return map;
    for (const sq of reachable(state, sel)) {
      const o = unitAt(state, sq);
      map.set(sq, o < 0 ? 'move' : sideOfUnit(o) === side ? 'swap' : matchup(state.kind[sel], state.kind[o], sq));
    }
    return map;
  }, [state, sel, side]);

  const threat = useMemo(
    () => (overlay === 'off' ? null : { map: threatMap(state, overlay === 'enemy' ? opponent(side) : side), side: overlay === 'enemy' ? opponent(side) : side }),
    [state, side, overlay],
  );

  function onSquare(sq: number) {
    setNotice('');
    const u = unitAt(state, sq);
    const own = u >= 0 && sideOfUnit(u) === side;
    if (sel !== null) {
      if (u === sel) {
        setOrders(orders.filter((o) => o.from !== state.pos[sel]));
        return setSel(null);
      }
      if (targets.has(sq)) {
        const from = state.pos[sel];
        const existing = orders.findIndex((o) => o.from === from);
        if (existing >= 0) setOrders(orders.map((o, i) => (i === existing ? { from, to: sq } : o)));
        else if (orders.length >= MAX_ORDERS) return setNotice(`You already have ${MAX_ORDERS} orders. Remove one first.`);
        else setOrders([...orders, { from, to: sq }]);
        return setSel(null);
      }
    }
    setSel(own ? u : null);
  }

  const units: UnitView[] = [];
  state.pos.forEach((sq, u) => {
    if (sq >= 0) units.push({ key: u, side: sideOfUnit(u), kind: KINDS[state.kind[u]], sq, selected: u === sel });
  });
  const arrows: Arrow[] = orders.map((o, i) => ({ key: i, from: o.from, to: o.to, side, ok: !problems.has(i) }));
  const selKind = sel !== null ? kindOf(state.kind, sel) : null;

  return (
    <div class="screen">
      <header class="bar">
        <h2><span class={`dot ${side}`} />Day {state.day + 1} · {SIDE_NAME[side]} orders</h2>
        <span class={`counter${orders.length === MAX_ORDERS ? ' full' : ''}`}>{orders.length}/{MAX_ORDERS}</span>
      </header>
      <div class="layout">
        <div class="board-wrap">
          <Board view={side} units={units} targets={targets} arrows={arrows} threat={threat} onSquareDown={onSquare} />
        </div>
        <aside class="panel">
          <Forces state={state} side={side} />
          <div class="segmented" role="group" aria-label="Artillery overlay">
            {(['off', 'enemy', 'own'] as const).map((o) => (
              <button key={o} class={overlay === o ? 'on' : ''} onClick={() => setOverlay(o)}>
                {o === 'off' ? 'No overlay' : o === 'enemy' ? 'Enemy guns' : 'Our guns'}
              </button>
            ))}
          </div>
          {selKind ? (
            <p class="selected-info">
              <span class={`chip ${side}`}><UnitIcon kind={selKind} /></span> {NAME[selKind]} on {squareName(state.pos[sel!])} ·
              moves {moveOf(selKind)}. Rings: <b class="win">green</b> wins, <b class="lose">red</b> loses,
              <b class="both"> orange</b> both fall (if the enemy stays put).
            </p>
          ) : (
            <p class="muted small">Tap one of your units to see where it can go.</p>
          )}
          {notice && <p class="notice">{notice}</p>}
          <ol class="orders">
            {orders.map((o, i) => {
              const u = unitAt(state, o.from);
              const reason = problems.get(i);
              return (
                <li key={i} class={reason ? 'bad' : ''}>
                  <span class={`chip ${side}`}><UnitIcon kind={kindOf(state.kind, u)} /></span>
                  {squareName(o.from)} → {squareName(o.to)}
                  {reason && <span class="why">fails: {REASON[reason]}</span>}
                  <button class="icon" aria-label="Remove order" onClick={() => setOrders(orders.filter((_, j) => j !== i))}>✕</button>
                </li>
              );
            })}
          </ol>
          <div class="row">
            <button class={`primary ${side}`} disabled={busy} onClick={() => onSubmit(orders)}>
              {orders.length ? `Submit ${orders.length} order${orders.length > 1 ? 's' : ''}` : 'Submit (hold all)'}
            </button>
            <button class="small" onClick={() => { setOrders([]); setSel(null); }} disabled={!orders.length}>Clear</button>
          </div>
          {extra}
          <h3>Log</h3>
          <Log history={history} kinds={state.kind} />
        </aside>
      </div>
    </div>
  );
}
