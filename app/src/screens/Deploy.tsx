import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ARMY, BOARD, KINDS, createRng, shuffle, sq as sqOf, squareName, type Deployment, type Kind, type Side } from '@fc/engine';
import { Board, type UnitView } from '../components/Board.tsx';
import { clientToSquare } from '../geometry.ts';
import { NAME, SHORT, SIDE_NAME } from '../labels.ts';
import { drawFromMix, forSide, loadResults, type OptimizerResults } from '../results.ts';

type Source = { type: 'tray'; kind: Kind } | { type: 'square'; sq: number };
type Selection = Source | null;

/** Place all 40 units: drag from the tray (or tap a unit type, then a square); drag placed units to swap them. */
export function Deploy({ side, onDone }: { side: Side; onDone: (d: Deployment) => void }) {
  const [placed, setPlaced] = useState<Map<number, Kind>>(new Map());
  const [sel, setSel] = useState<Selection>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; kind: Kind } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zone = useMemo(() => new Set(BOARD.zone[side]), [side]);
  const [recommended, setRecommended] = useState<OptimizerResults | null>(null);
  const [usedSetup, setUsedSetup] = useState('');
  useEffect(() => void loadResults().then(setRecommended), []);

  /** Draw a setup from the optimizer's recommended mix (at random, so it can't be predicted). */
  function useRecommended() {
    if (!recommended) return;
    const pick = drawFromMix(recommended);
    const dep = forSide(pick.deployment, side);
    setPlaced(new Map(Object.entries(dep).map(([name, k]) => [sqOf(name), k])));
    setSel(null);
    setUsedSetup(pick.id);
  }

  const remaining = (map: Map<number, Kind>, kind: Kind) =>
    ARMY[KINDS.indexOf(kind)] - [...map.values()].filter((k) => k === kind).length;

  function place(map: Map<number, Kind>, sq: number, kind: Kind) {
    if (remaining(map, kind) > 0 || map.get(sq) === kind) map.set(sq, kind);
  }

  function apply(fn: (m: Map<number, Kind>) => void) {
    setPlaced((prev) => {
      const next = new Map(prev);
      fn(next);
      return next;
    });
  }

  function tap(src: Source) {
    if (src.type === 'tray') {
      if (sel?.type === 'square') {
        apply((m) => m.delete(sel.sq)); // put the picked-up unit back
        setSel(null);
      } else if (remaining(placed, src.kind) > 0) {
        setSel(sel?.type === 'tray' && sel.kind === src.kind ? null : src);
      }
      return;
    }
    const sq = src.sq;
    if (!zone.has(sq)) return setSel(null);
    if (sel?.type === 'tray') {
      apply((m) => place(m, sq, sel.kind));
      if (remaining(placed, sel.kind) <= 1 && !placed.has(sq)) setSel(null);
    } else if (sel?.type === 'square') {
      if (sel.sq !== sq) apply((m) => swap(m, sel.sq, sq));
      setSel(null);
    } else if (placed.has(sq)) {
      setSel(src);
    }
  }

  function drop(src: Source, target: number) {
    setSel(null);
    if (target < 0 || !zone.has(target)) {
      if (src.type === 'square') apply((m) => m.delete(src.sq));
      return;
    }
    if (src.type === 'tray') apply((m) => place(m, target, src.kind));
    else apply((m) => swap(m, src.sq, target));
  }

  /** Distinguish a tap from a drag: past 6px of movement it becomes a drag with a floating token. */
  function press(src: Source, e: PointerEvent) {
    const kind = src.type === 'tray' ? src.kind : placed.get(src.sq);
    if (src.type === 'tray' && remaining(placed, src.kind) === 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!kind) return;
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) dragging = true;
      if (dragging) setGhost({ x: ev.clientX, y: ev.clientY, kind });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setGhost(null);
      if (dragging && svgRef.current) drop(src, clientToSquare(svgRef.current, ev.clientX, ev.clientY, side));
      else tap(src);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function fillRandomly() {
    apply((m) => {
      const rng = createRng(Date.now());
      const empty = shuffle(rng, BOARD.zone[side].filter((s) => !m.has(s)));
      for (const k of KINDS) for (let n = remaining(m, k); n > 0; n--) m.set(empty.pop()!, k);
    });
    setSel(null);
  }

  const units: UnitView[] = [...placed].map(([sq, kind]) => ({
    key: sq, side, kind, sq, selected: sel?.type === 'square' && sel.sq === sq,
  }));
  const count = placed.size;

  return (
    <div class="screen">
      <header class="bar">
        <h2><span class={`dot ${side}`} />{SIDE_NAME[side]} deployment</h2>
        <span class="counter">{count}/40</span>
      </header>
      <div class="layout">
        <div class="board-wrap" style={{ touchAction: 'none' }}>
          <Board view={side} units={units} allowed={zone} svgRef={svgRef} onSquareDown={(sq, e) => press({ type: 'square', sq }, e)} />
        </div>
        <aside class="panel">
          <p class="muted small">
            Drag units onto the lit squares, or tap a unit type and then a square. Drag a placed unit onto another to swap
            them, or off the board to remove it.
          </p>
          <div class="tray" style={{ touchAction: 'none' }}>
            {KINDS.map((k) => {
              const left = remaining(placed, k);
              const active = sel?.type === 'tray' && sel.kind === k;
              return (
                <button
                  key={k} class={`tray-item ${side}${active ? ' active' : ''}`} disabled={left === 0}
                  onPointerDown={(e) => press({ type: 'tray', kind: k }, e)} title={NAME[k]}
                >
                  <span class="token-chip">{SHORT[k]}</span>
                  <span class="tray-name">{NAME[k]}</span>
                  <span class="tray-count">×{left}</span>
                </button>
              );
            })}
          </div>
          <div class="row">
            <button onClick={fillRandomly} disabled={count === 40}>Fill the rest randomly</button>
            <button onClick={() => { setPlaced(new Map()); setSel(null); }} disabled={count === 0}>Clear</button>
            {recommended && <button onClick={useRecommended}>Use a recommended setup</button>}
          </div>
          {usedSetup && <p class="muted small">Drawn from the recommended mix ({usedSetup}). Adjust it if you like.</p>}
          <button
            class={`primary big ${side}`} disabled={count !== 40}
            onClick={() => onDone(Object.fromEntries([...placed].map(([sq, k]) => [squareName(sq), k])))}
          >
            {count === 40 ? 'Confirm deployment' : `Place ${40 - count} more`}
          </button>
        </aside>
      </div>
      {ghost && (
        <div class={`ghost ${side}`} style={{ left: `${ghost.x}px`, top: `${ghost.y}px` }}>{SHORT[ghost.kind]}</div>
      )}
    </div>
  );
}

function swap(m: Map<number, Kind>, a: number, b: number) {
  const ka = m.get(a), kb = m.get(b);
  if (ka) m.set(b, ka); else m.delete(b);
  if (kb) m.set(a, kb); else m.delete(a);
}
