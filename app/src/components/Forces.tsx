import { ARMY, KINDS, opponent, sideOfUnit, type GameState, type Side } from '@fc/engine';
import { ABBR, NAME, SIDE_NAME } from '../labels.ts';
import { UnitIcon } from './Emblem.tsx';
import { useUnitStyle } from '../prefs.ts';

/** Units left of each kind for both sides, the viewer's side first. With emblems, the headings double as their key. */
export function Forces({ state, side }: { state: GameState; side: Side }) {
  const emblems = useUnitStyle() === 'emblems';
  const left: Record<Side, number[]> = { blue: KINDS.map(() => 0), red: KINDS.map(() => 0) };
  state.pos.forEach((sq, u) => {
    if (sq >= 0) left[sideOfUnit(u)][state.kind[u]]++;
  });
  return (
    <table class="forces" aria-label="Units left">
      <thead>
        <tr>
          <th />
          {KINDS.map((k) => (
            <th key={k} title={NAME[k]}><UnitIcon kind={k} />{emblems && <span class="abbr">{ABBR[k]}</span>}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[side, opponent(side)].map((s) => (
          <tr key={s}>
            <th><span class={`dot ${s}`} />{SIDE_NAME[s]}</th>
            {left[s].map((n, i) => (
              <td key={i} class={n === 0 ? 'gone' : n < ARMY[i] ? 'lost' : ''} title={`${n} of ${ARMY[i]} left`}>{n}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
