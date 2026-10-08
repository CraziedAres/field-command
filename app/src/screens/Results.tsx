import { useEffect, useMemo, useState } from 'preact/hooks';
import { sq, type Side } from '@fc/engine';
import { Board, type UnitView } from '../components/Board.tsx';
import { loadResults, forSide, type OptimizerResults } from '../results.ts';

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

const FEATURE_LABELS: Record<string, string> = {
  generalDepth: 'General: rows from home edge',
  generalRaidDays: 'General: days before a raider can reach him',
  generalBodyguards: 'General: neighbouring bodyguards',
  generalGunCover: 'General: nearby squares under own guns',
  gunElevation: 'Guns: average elevation',
  infantryInForest: 'Infantry in forest',
  cavalryInOpen: 'Cavalry in the open',
  guerrillaDepth: 'Guerrillas: average rows forward',
};

/** Viewer for the deployment optimizer's results (solver: npm run optimize -- --publish). */
export function Results() {
  const [results, setResults] = useState<OptimizerResults | null | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<Side>('blue');

  useEffect(() => {
    loadResults().then((r) => {
      setResults(r);
      if (r) setSelected(r.recommended[0] ?? r.layouts[0]?.id ?? null);
    });
  }, []);

  async function openFile(file: File) {
    try {
      const r = JSON.parse(await file.text()) as OptimizerResults;
      setResults(r);
      setSelected(r.recommended[0] ?? null);
    } catch {
      alert('That file is not an optimizer results file.');
    }
  }

  const layout = results?.layouts.find((l) => l.id === selected) ?? null;
  const units: UnitView[] = useMemo(
    () => (layout ? Object.entries(forSide(layout.deployment, view)).map(([name, kind]) => ({ key: name, side: view, kind, sq: sq(name) })) : []),
    [layout, view],
  );

  if (results === undefined) return <div class="center-msg"><p class="muted">Loading results…</p></div>;
  if (results === null) {
    return (
      <div class="menu">
        <h1>Recommended setups</h1>
        <p class="muted">No published results yet. Run <code>npm run optimize -- --publish</code>, or open a results file:</p>
        <input type="file" accept="application/json" onChange={(e) => e.currentTarget.files?.[0] && openFile(e.currentTarget.files[0])} />
      </div>
    );
  }

  const rows = showAll ? [...results.layouts].sort((a, b) => b.weight - a.weight || b.averageScore - a.averageScore) : results.recommended.map((id) => results.layouts.find((l) => l.id === id)!);
  const last = results.iterations[results.iterations.length - 1];
  const v = results.validation;

  return (
    <div class="screen">
      <header class="bar">
        <h2>Recommended setups</h2>
        <label class="file-btn">
          Open results file
          <input type="file" accept="application/json" onChange={(e) => e.currentTarget.files?.[0] && openFile(e.currentTarget.files[0])} />
        </label>
      </header>
      <div class="layout">
        <div>
          <div class="board-wrap">
            <Board view={view} units={units} allowed={undefined} />
          </div>
          <div class="row" style={{ justifyContent: 'center' }}>
            <div class="segmented" style={{ minWidth: '240px' }}>
              {(['blue', 'red'] as const).map((s) => (
                <button key={s} class={view === s ? 'on' : ''} onClick={() => setView(s)}>As {s === 'blue' ? 'Blue' : 'Red'}</button>
              ))}
            </div>
          </div>
        </div>
        <aside class="panel">
          <p class="small muted">
            Play these at random with the given weights: a fixed setup can be countered. Scores are win rates (draws count
            half) in bot games against the other setups.
          </p>
          <table class="results-table">
            <thead><tr><th>Setup</th><th>Weight</th><th>Average</th><th>Worst case</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} class={l.id === selected ? 'sel' : ''} onClick={() => setSelected(l.id)}>
                  <td>{l.id}</td><td>{pct(l.weight)}</td><td>{pct(l.averageScore)}</td><td>{pct(l.worstScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button class="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show recommended only' : `Show all ${results.layouts.length} setups`}</button>

          {layout && (
            <>
              <h3>{layout.id}</h3>
              <p class="small muted">{layout.origin}. Worst result against {layout.worstOpponent}; {pct(layout.scoreVsMixture)} against the recommended mix.</p>
              <table class="results-table features">
                <tbody>
                  {Object.entries(layout.features).map(([k, x]) => (
                    <tr key={k}><td>{FEATURE_LABELS[k] ?? k}</td><td>{k.startsWith('infantry') || k.startsWith('cavalry') ? pct(x) : Number.isInteger(x) ? x : x.toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>How solid is this?</h3>
          <p class="small">
            Best counter-setup found in the last round: {pct(0.5 + last.exploitability)} against the mix
            (exploitability {(100 * last.exploitability).toFixed(1)} points; 0 would be a perfect equilibrium).
          </p>
          <p class="small">
            Rank agreement when replayed with the stronger regret bot: {v.rankCorrelation.toFixed(2)} (1 = same order).
          </p>
          <p class="small muted">
            {results.iterations.length} search rounds, {results.layouts.length} setups, generated {new Date(results.generated).toLocaleString()}.
          </p>
        </aside>
      </div>
    </div>
  );
}
