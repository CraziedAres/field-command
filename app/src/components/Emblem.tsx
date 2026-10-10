import type { Kind } from '@fc/engine';
import { NAME, SHORT } from '../labels.ts';
import { useUnitStyle } from '../prefs.ts';

// Glyphs are drawn in currentColor around (0, 0), sized for a token of radius 36.
const rankOf = (k: Kind) => (/\d$/.test(k) ? Number(k.slice(-1)) : 0);

function star(r: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
}
const STAR = star(22, 2);

/** Map-symbol emblem: ✕ infantry, left chevron cavalry, dot artillery, star general, zigzag guerrillas; pips = rank. */
export function Glyph({ kind }: { kind: Kind }) {
  if (kind === 'GEN') return <polygon points={STAR} class="glyph-fill" />;
  if (kind === 'ART') return <circle r={11} class="glyph-fill" />;
  if (kind === 'GUE') return <polyline points="-19,5 -10,-7 0,5 10,-7 19,5" class="glyph-line" />;
  const r = rankOf(kind);
  const y = -6;
  const mark = kind.startsWith('INF')
    ? <path d={`M-13,${y - 11} L13,${y + 9} M13,${y - 11} L-13,${y + 9}`} class="glyph-line" />
    : <polyline points={`17,${y - 12} -18,${y} 17,${y + 12}`} class="glyph-line" />;
  return (
    <>
      {mark}
      {Array.from({ length: r }, (_, i) => <circle key={i} cx={(i - (r - 1) / 2) * 12} cy={21} r={4.5} class="glyph-fill" />)}
    </>
  );
}

/** A unit's mark inside a board token (SVG), following the emblem/letter preference. */
export function TokenMark({ kind }: { kind: Kind }) {
  if (useUnitStyle() === 'emblems') return <Glyph kind={kind} />;
  return <text class={`label${kind === 'GEN' ? ' star' : ''}`} y={kind === 'GEN' ? 13 : 11}>{SHORT[kind]}</text>;
}

/** A unit's mark in HTML (chips, tables), following the emblem/letter preference. */
export function UnitIcon({ kind }: { kind: Kind }) {
  if (useUnitStyle() === 'letters') return <>{SHORT[kind]}</>;
  return (
    <svg class="glyph" viewBox="-30 -30 60 60" role="img" aria-label={NAME[kind]}>
      <Glyph kind={kind} />
    </svg>
  );
}
