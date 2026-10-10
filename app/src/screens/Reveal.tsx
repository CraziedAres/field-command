import { useEffect, useMemo, useState } from 'preact/hooks';
import { KINDS, sideOfUnit, type DayEvent, type GameState, type Side } from '@fc/engine';
import { Board, type UnitView } from '../components/Board.tsx';
import { dayMotion } from '../dayMotion.ts';
import { Log } from './Log.tsx';
import { SIDE_NAME, describe } from '../labels.ts';
import type { DayRecord } from '../store.ts';

const STEPS = ['Orders revealed', 'Units move', 'Clashes', 'Artillery fire', 'End of day'];
const STEP_MS = 1300;

/** Replays a resolved day in stages: orders, movement, clashes, artillery. */
export function Reveal({ before, after, events, history, onContinue, onNewGame, view = 'blue', endLabel = 'New game', you }: {
  before: GameState; after: GameState; events: DayEvent[]; history: DayRecord[];
  onContinue: () => void; onNewGame: () => void; view?: Side; endLabel?: string;
  /** The viewing player's side, when there is one (online or against the computer). */
  you?: Side;
}) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep(step + 1), step === 0 ? 1600 : STEP_MS);
    return () => clearTimeout(t);
  }, [step, playing]);

  const { moved, clashed, shot, arrows, clashSquares, shots } = useMemo(() => dayMotion(before, events), [before, events]);

  const units: UnitView[] = [];
  before.pos.forEach((sq, u) => {
    if (sq < 0) return;
    const hidden = (step >= 2 && clashed.has(u)) || (step >= 3 && shot.has(u));
    units.push({ key: u, side: sideOfUnit(u), kind: KINDS[before.kind[u]], sq: step === 0 ? sq : moved[u], hidden });
  });

  // Nothing in the panel may give away the outcome before the animation reaches it.
  const done = step === STEPS.length - 1;
  const result = done ? after.result : null;
  const dayEvents = events.filter((e) => e.type !== 'move' && e.type !== 'rejected');

  return (
    <div class="screen">
      <header class="bar">
        <h2>Day {after.day} · {STEPS[step]}</h2>
        <div class="row tight">
          <button onClick={() => { setStep(0); setPlaying(true); }}>Replay</button>
          {step < STEPS.length - 1 && <button onClick={() => { setStep(STEPS.length - 1); setPlaying(false); }}>Skip</button>}
        </div>
      </header>
      <div class="layout">
        <div class="board-wrap">
          <Board
            view={view} units={units} animate
            arrows={step <= 1 ? arrows : []}
            flashes={step === 2 ? clashSquares : []}
            shots={step === 3 ? shots.map((s) => ({ key: s.key, from: moved[s.from], to: moved[s.to] })) : []}
          />
        </div>
        <aside class="panel">
          {result && (
            <div class={`result ${result.winner ?? 'draw'}`}>
              <h2>{!result.winner ? 'Draw' : you ? (result.winner === you ? 'You win!' : 'You lose') : `${SIDE_NAME[result.winner]} wins`}</h2>
              <p>{describe({ type: 'end', result }, before.kind)}</p>
            </div>
          )}
          <h3>This day</h3>
          {!done ? (
            <p class="muted small">{STEPS[step]}…</p>
          ) : dayEvents.length ? (
            <ul class="day-events">{dayEvents.map((e, i) => <li key={i} class={`ev ${e.type}`}>{describe(e, before.kind)}</li>)}</ul>
          ) : (
            <p class="muted small">No clashes and no artillery hits.</p>
          )}
          {after.result ? (
            <button class="primary big" disabled={!done} onClick={onNewGame}>{endLabel}</button>
          ) : (
            <button class="primary big" disabled={step < STEPS.length - 1} onClick={onContinue}>Next day</button>
          )}
          <h3>Log</h3>
          <Log history={done ? history : history.slice(0, -1)} kinds={before.kind} />
        </aside>
      </div>
    </div>
  );
}
