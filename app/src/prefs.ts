import { useEffect, useState } from 'preact/hooks';

/** How units are drawn: map-symbol emblems (default) or the short letter codes. */
export type UnitStyle = 'emblems' | 'letters';

const STYLE_KEY = 'field-command.unit-style.v1';
const listeners = new Set<() => void>();

let unitStyle: UnitStyle = (() => {
  try {
    return localStorage.getItem(STYLE_KEY) === 'letters' ? 'letters' : 'emblems';
  } catch {
    return 'emblems';
  }
})();

export function setUnitStyle(s: UnitStyle) {
  unitStyle = s;
  try {
    localStorage.setItem(STYLE_KEY, s);
  } catch {
    // storage unavailable: keep it for this visit only
  }
  listeners.forEach((f) => f());
}

export function useUnitStyle(): UnitStyle {
  const [, rerender] = useState(0);
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return unitStyle;
}
