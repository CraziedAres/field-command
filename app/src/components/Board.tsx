import type { Ref } from 'preact';
import { BOARD, ROWS, SIZE, SQUARES, type Kind, type Side } from '@fc/engine';
import { CELL, MARGIN, VIEW_H, VIEW_W, center, clientToSquare, squareAtGrid, topLeft } from '../geometry.ts';
import { SHORT, type Matchup } from '../labels.ts';

export interface UnitView {
  key: string | number;
  side: Side;
  kind: Kind;
  sq: number;
  hidden?: boolean;
  selected?: boolean;
}

export type Target = 'move' | 'swap' | Matchup;

export interface Arrow {
  key: string | number;
  from: number;
  to: number;
  side: Side;
  ok: boolean;
}

export interface BoardProps {
  view: Side;
  units: UnitView[];
  /** Squares outside this set are dimmed (deployment). */
  allowed?: Set<number>;
  targets?: Map<number, Target>;
  /** Per-square count of guns covering it, drawn as a tint. */
  threat?: { map: Uint8Array; side: Side } | null;
  arrows?: Arrow[];
  shots?: { key: string | number; from: number; to: number }[];
  flashes?: number[];
  animate?: boolean;
  onSquareDown?: (sq: number, e: PointerEvent) => void;
  svgRef?: Ref<SVGSVGElement>;
}

const TERRAIN = {
  forest: ['#5b7a40', '#6e8f50', '#83a565'],
  open: ['#d6c7a0', '#e3d6b4', '#efe6cc'],
};
const TARGET_STROKE: Record<Target, string> = {
  move: '#ffffff', swap: '#ffffff', win: '#2fbf4a', lose: '#e5383b', both: '#f4a020',
};

export function Board(p: BoardProps) {
  const squares = [];
  for (let sq = 0; sq < SQUARES; sq++) squares.push(<Square key={sq} sq={sq} view={p.view} dim={p.allowed && !p.allowed.has(sq)} />);

  const labels = [];
  for (let g = 0; g < SIZE; g++) {
    const sqLeft = squareAtGrid(0, g, p.view), sqBottom = squareAtGrid(g, SIZE - 1, p.view);
    labels.push(
      <text key={`r${g}`} class="axis" x={MARGIN / 2} y={g * CELL + CELL / 2}>{ROWS[Math.floor(sqLeft / SIZE)]}</text>,
      <text key={`c${g}`} class="axis" x={MARGIN + g * CELL + CELL / 2} y={SIZE * CELL + MARGIN / 2}>{(sqBottom % SIZE) + 1}</text>,
    );
  }

  return (
    <svg
      ref={p.svgRef}
      class={`board${p.animate ? ' animate' : ''}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      onPointerDown={(e) => {
        const sq = clientToSquare(e.currentTarget, e.clientX, e.clientY, p.view);
        if (sq >= 0) p.onSquareDown?.(sq, e);
      }}
    >
      <defs>
        <marker id="head-blue" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--blue-bright)" />
        </marker>
        <marker id="head-red" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--red-bright)" />
        </marker>
        <marker id="head-bad" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#555" />
        </marker>
        <pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="16" fill="currentColor" />
        </pattern>
      </defs>
      <g>{squares}</g>
      {p.threat && <Threat {...p.threat} view={p.view} />}
      {p.targets && <Targets targets={p.targets} view={p.view} />}
      <g>{labels}</g>
      <g class="units">
        {p.units.map((u) => <Unit key={u.key} u={u} view={p.view} />)}
      </g>
      <g class="arrows">
        {p.arrows?.map((a) => {
          const f = center(a.from, p.view), t = center(a.to, p.view);
          const k = shorten(f, t, 30);
          return (
            <line
              key={a.key} x1={f.x} y1={f.y} x2={k.x} y2={k.y}
              class={`arrow ${a.side}${a.ok ? '' : ' bad'}`}
              marker-end={`url(#head-${a.ok ? a.side : 'bad'})`}
            />
          );
        })}
      </g>
      <g class="shots">
        {p.shots?.map((s) => {
          const f = center(s.from, p.view), t = center(s.to, p.view);
          return <line key={s.key} class="shot" x1={f.x} y1={f.y} x2={t.x} y2={t.y} />;
        })}
      </g>
      <g>
        {p.flashes?.map((sq) => {
          const c = center(sq, p.view);
          return <circle key={`f${sq}`} class="flash" cx={c.x} cy={c.y} r={46} />;
        })}
      </g>
    </svg>
  );
}

function shorten(f: { x: number; y: number }, t: { x: number; y: number }, by: number) {
  const dx = t.x - f.x, dy = t.y - f.y, len = Math.hypot(dx, dy) || 1;
  return { x: t.x - (dx / len) * by, y: t.y - (dy / len) * by };
}

/** A terrain square; each elevation level adds a raised terrace so height reads at a glance. */
function Square({ sq, view, dim }: { sq: number; view: Side; dim?: boolean }) {
  const { x, y } = topLeft(sq, view);
  const palette = BOARD.forest[sq] ? TERRAIN.forest : TERRAIN.open;
  const elev = BOARD.elevation[sq];
  const terraces = [];
  for (let level = 1; level <= elev; level++) {
    const inset = (level - 1) * 12;
    terraces.push(
      <rect
        key={level} x={x + inset} y={y + inset} width={CELL - 2 * inset} height={CELL - 2 * inset}
        rx={level === 1 ? 0 : 8} fill={palette[level - 1]} class={level > 1 ? 'terrace' : undefined}
      />,
    );
  }
  return (
    <g>
      {terraces}
      <rect x={x} y={y} width={CELL} height={CELL} class="cell" />
      <text x={x + 9} y={y + 22} class="elev">{elev}</text>
      {dim && <rect x={x} y={y} width={CELL} height={CELL} class="dim" />}
    </g>
  );
}

function Unit({ u, view }: { u: UnitView; view: Side }) {
  const c = center(u.sq, view);
  return (
    <g
      class={`unit ${u.side}${u.selected ? ' selected' : ''}`}
      style={{ transform: `translate(${c.x}px, ${c.y}px)`, opacity: u.hidden ? 0 : 1 }}
    >
      <circle r={36} class="token" />
      <text class={`label${u.kind === 'GEN' ? ' star' : ''}`} y={u.kind === 'GEN' ? 13 : 11}>{SHORT[u.kind]}</text>
    </g>
  );
}

function Targets({ targets, view }: { targets: Map<number, Target>; view: Side }) {
  return (
    <g class="targets">
      {[...targets].map(([sq, t]) => {
        const c = center(sq, view);
        return t === 'move'
          ? <circle key={sq} cx={c.x} cy={c.y} r={12} class="target-dot" />
          : <circle key={sq} cx={c.x} cy={c.y} r={44} class={`target-ring ${t}`} stroke={TARGET_STROKE[t]} />;
      })}
    </g>
  );
}

function Threat({ map, side, view }: { map: Uint8Array; side: Side; view: Side }) {
  const cells = [];
  for (let sq = 0; sq < SQUARES; sq++) {
    if (!map[sq]) continue;
    const { x, y } = topLeft(sq, view);
    cells.push(
      <rect key={sq} x={x} y={y} width={CELL} height={CELL} fill="url(#hatch)" style={{ opacity: Math.min(0.25 + 0.15 * map[sq], 0.7) }} />,
    );
  }
  return <g class={`threat ${side}`}>{cells}</g>;
}
