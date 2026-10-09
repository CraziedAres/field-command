import { useState } from 'preact/hooks';
import { OnlineMenu } from '../online/OnlineMenu.tsx';
import { InstallCard } from '../components/InstallCard.tsx';
import { UnitsCard } from '../components/UnitsCard.tsx';
import { LEVELS, type Level } from '../bot/client.ts';
import type { Side } from '@fc/engine';

export function Menu({ canResume, onResume, onNew, onComputer, navigate }: {
  canResume: boolean; onResume: () => void; onNew: (maxDays?: number) => void;
  onComputer: (maxDays: number | undefined, human: Side, level: Level) => void; navigate: (to: string) => void;
}) {
  const [maxDays, setMaxDays] = useState('');
  const [level, setLevel] = useState<Level>('medium');
  const [humanSide, setHumanSide] = useState<Side | 'random'>('blue');
  const days = maxDays ? Number(maxDays) : undefined;
  return (
    <div class="menu">
      <h1>Field Command</h1>
      <p class="lede">Two armies, one board, simultaneous secret orders. Remove the enemy General to win.</p>
      <InstallCard />
      <div class="card rules">
        <h2>How to play</h2>
        <ol>
          <li><b>Deploy.</b> Each side secretly fills its 40 starting squares, one unit per square. Both armies are revealed together.</li>
          <li><b>Give orders.</b> Each day both players secretly order up to 12 units. A unit moves up to its allowance in
            straight steps (a diagonal costs 2) and may jump over any unit. Friends may swap squares but not share one; an
            illegal order leaves that unit where it is.</li>
          <li><b>Move together.</b> All orders happen at once; only where units end up matters.</li>
          <li><b>Clash.</b> Enemies ending on the same square fight. The winner depends on the units and the terrain (see
            Units below); identical units remove each other.</li>
          <li><b>Gunfire.</b> Then every surviving gun removes all enemies except Guerrillas within range: 1 square on its own
            level, 2 one level down, 3 two levels down, none uphill.</li>
          <li><b>Win.</b> Remove the enemy General. If both Generals fall on the same day, it's a draw.</li>
        </ol>
      </div>
      <label class="field day-limit">
        Day limit for new games
        <select value={maxDays} onChange={(e) => setMaxDays(e.currentTarget.value)}>
          <option value="">None</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="100">100 days</option>
        </select>
      </label>
      {canResume && (
        <div class="row"><button class="primary" onClick={onResume}>Resume saved game</button></div>
      )}
      <div class="card">
        <h2>Play the computer</h2>
        <div class="row">
          <label class="field">
            Difficulty
            <select value={level} onChange={(e) => setLevel(e.currentTarget.value as Level)}>
              {(Object.keys(LEVELS) as Level[]).map((l) => <option key={l} value={l}>{LEVELS[l].label}</option>)}
            </select>
          </label>
          <label class="field">
            You play
            <select value={humanSide} onChange={(e) => setHumanSide(e.currentTarget.value as Side | 'random')}>
              <option value="blue">Blue</option>
              <option value="red">Red</option>
              <option value="random">Random</option>
            </select>
          </label>
        </div>
        <p class="muted small">{LEVELS[level].blurb}</p>
        <button
          class="primary"
          onClick={() => onComputer(days, humanSide === 'random' ? (Math.random() < 0.5 ? 'blue' : 'red') : humanSide, level)}
        >
          Start game
        </button>
      </div>
      <OnlineMenu maxDays={days} navigate={navigate} />
      <div class="card">
        <h2>Hot-seat game</h2>
        <p class="muted">Both players share this device and pass it between turns.</p>
        <div class="row">
          <button class="primary" onClick={() => onNew(days)}>New game</button>
        </div>
      </div>
      <div class="card">
        <h2>Recommended setups</h2>
        <p class="muted">Strong deployments found by the optimizer, to study or to use.</p>
        <button onClick={() => navigate('/results')}>View recommended setups</button>
      </div>
      <UnitsCard />
    </div>
  );
}
