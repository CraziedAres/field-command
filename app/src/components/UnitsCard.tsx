import { useState } from 'preact/hooks';
import { A_WINS, ARMY, BOTH, KINDS, MOVE, combat } from '@fc/engine';
import { NAME } from '../labels.ts';
import { UnitIcon } from './Emblem.tsx';
import { setUnitStyle, useUnitStyle } from '../prefs.ts';

const CELL = {
  [A_WINS]: { mark: '✓', cls: 'win', word: 'wins' },
  [BOTH]: { mark: '=', cls: 'both', word: 'both removed' },
} as const;
const LOSE = { mark: '✗', cls: 'lose', word: 'loses' };

/** Menu card: unit counts and moves, plus who beats whom on each terrain. */
export function UnitsCard() {
  const [forest, setForest] = useState(true);
  const style = useUnitStyle();
  return (
    <div class="card units-card">
      <div class="matrix-head">
        <h2>Units</h2>
        <div class="seg" role="group" aria-label="Unit markers">
          <button aria-pressed={style === 'emblems'} onClick={() => setUnitStyle('emblems')}>Emblems</button>
          <button aria-pressed={style === 'letters'} onClick={() => setUnitStyle('letters')}>Letters</button>
        </div>
      </div>
      <table class="units-table">
        <thead><tr><th></th><th>Unit</th><th>Count</th><th>Move</th></tr></thead>
        <tbody>
          {KINDS.map((k, i) => (
            <tr key={k}><td><span class="chip"><UnitIcon kind={k} /></span></td><td>{NAME[k]}</td><td>{ARMY[i]}</td><td>{MOVE[i]}</td></tr>
          ))}
        </tbody>
      </table>

      <h3>Who wins a clash</h3>
      <p class="muted small">When enemies end on the same square. Each unit beats everything to its right.</p>
      <ul class="beats">
        <li><span class="terrain forest">Forest</span> Infantry › Guerrillas › Cavalry</li>
        <li><span class="terrain open">Open field</span> Cavalry › Guerrillas › Infantry</li>
        <li><span class="terrain">Same arm</span> 1st › 2nd › 3rd › 1st <span class="muted">(a loop, on any terrain)</span></li>
      </ul>
      <ul class="beats-notes">
        <li>Rank only matters within the same arm: any Infantry vs any Cavalry follows the terrain line.</li>
        <li>Infantry, Cavalry and Guerrillas beat <b>Artillery</b>.</li>
        <li>Every unit beats the <b>General</b>.</li>
        <li>Identical units (e.g. 2nd Cavalry vs 2nd Cavalry, gun vs gun, General vs General) remove each other.</li>
      </ul>

      <div class="matrix-head">
        <h3>Matchup chart</h3>
        <div class="seg" role="group" aria-label="Terrain">
          <button aria-pressed={forest} onClick={() => setForest(true)}>Forest</button>
          <button aria-pressed={!forest} onClick={() => setForest(false)}>Open field</button>
        </div>
      </div>
      <div class="matrix-wrap">
        <table class={`matrix ${forest ? 'forest' : 'open'}`}>
          <thead>
            <tr>
              <th class="corner" title="Rows: your unit. Columns: the enemy unit.">you ↓</th>
              {KINDS.map((k) => <th key={k} scope="col" title={NAME[k]}><UnitIcon kind={k} /></th>)}
            </tr>
          </thead>
          <tbody>
            {KINDS.map((a, i) => (
              <tr key={a}>
                <th scope="row" title={NAME[a]}><UnitIcon kind={a} /></th>
                {KINDS.map((b, j) => {
                  const o = combat(i, j, forest);
                  const c = o === A_WINS || o === BOTH ? CELL[o] : LOSE;
                  return <td key={b} class={c.cls} title={`${NAME[a]} vs ${NAME[b]}: ${c.word}`}>{c.mark}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="legend small">
        <span class="muted">Rows: your unit · columns: the enemy.</span>
        <span class="win">✓ you win</span> <span class="lose">✗ you lose</span> <span class="both">= both removed</span>
      </p>

      <h3>Gunfire</h3>
      <p class="muted small">
        After clashes, every surviving gun removes all enemies within range except Guerrillas: 1 square on its own level, 2
        one level down, 3 two levels down, none uphill. Guns that are in range of each other all fire, so they can destroy
        each other.
      </p>
    </div>
  );
}
