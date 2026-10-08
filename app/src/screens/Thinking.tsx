import { KINDS, deserializeState, sideOfUnit, sq } from '@fc/engine';
import { Board, type UnitView } from '../components/Board.tsx';
import { SIDE_NAME } from '../labels.ts';
import type { HotseatGame } from '../store.ts';

/** Shown while the computer deploys or writes its orders; the player's own orders stay visible. */
export function Thinking({ game }: { game: HotseatGame }) {
  const human = game.computer!.human;
  const units: UnitView[] = [];
  if (game.state) {
    const s = deserializeState(game.state);
    s.pos.forEach((p, u) => p >= 0 && units.push({ key: u, side: sideOfUnit(u), kind: KINDS[s.kind[u]], sq: p }));
  } else {
    for (const [name, kind] of Object.entries(game.deployments[human] ?? {})) units.push({ key: name, side: human, kind, sq: sq(name) });
  }
  const mine = game.orders[human] ?? [];
  return (
    <div class="screen">
      <header class="bar">
        <h2><span class={`dot ${human === 'blue' ? 'red' : 'blue'}`} />{SIDE_NAME[human === 'blue' ? 'red' : 'blue']} (computer)</h2>
      </header>
      <div class="layout">
        <div class="board-wrap">
          <Board view={human} units={units} arrows={mine.map((o, i) => ({ key: i, from: o.from, to: o.to, side: human, ok: true }))} />
        </div>
        <aside class="panel">
          <p class="waiting thinking">{game.state ? 'The computer is writing its orders…' : 'The computer is deploying…'}</p>
          <p class="muted small">It can't see your orders until both are in.</p>
        </aside>
      </div>
    </div>
  );
}
