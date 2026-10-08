import type { DayRecord } from '../store.ts';
import { describe } from '../labels.ts';

export function Log({ history, kinds }: { history: DayRecord[]; kinds: Uint8Array }) {
  if (!history.length) return <p class="muted small">No days played yet.</p>;
  return (
    <div class="log">
      {[...history].reverse().map((d) => (
        <details key={d.day} open={d.day === history.length}>
          <summary>Day {d.day}</summary>
          <ul>
            {d.events.map((e, i) => <li key={i} class={`ev ${e.type}`}>{describe(e, kinds)}</li>)}
          </ul>
        </details>
      ))}
    </div>
  );
}
