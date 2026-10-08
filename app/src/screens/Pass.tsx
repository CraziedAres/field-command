import type { Side } from '@fc/engine';
import { SIDE_NAME } from '../labels.ts';

export function Pass({ to, what, onReady }: { to: Side; what: string; onReady: () => void }) {
  return (
    <div class={`pass ${to}`}>
      <p class="eyebrow">Pass the device</p>
      <h1>{SIDE_NAME[to]}'s turn</h1>
      <p>{what}. {SIDE_NAME[to === 'blue' ? 'red' : 'blue']}, look away.</p>
      <button class={`primary big ${to}`} onClick={onReady}>I'm {SIDE_NAME[to]} — show my board</button>
    </div>
  );
}
