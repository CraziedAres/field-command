import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createGame, deserializeState, opponent, resolveDay, serializeState, type Deployment, type Order, type Side } from '@fc/engine';
import { computerDeployment, computerOrders, type Level } from './bot/client.ts';
import { Thinking } from './screens/Thinking.tsx';
import { Deploy } from './screens/Deploy.tsx';
import { Menu } from './screens/Menu.tsx';
import { Orders } from './screens/Orders.tsx';
import { Pass } from './screens/Pass.tsx';
import { Reveal } from './screens/Reveal.tsx';
import { loadSaved, save, type HotseatGame, type Saved, type Screen } from './store.ts';
import { Online } from './online/Online.tsx';
import { Results } from './screens/Results.tsx';
import { useRoute } from './router.ts';

const MENU: Saved = { screen: { name: 'menu' }, game: null };

export function App() {
  const [path, navigate] = useRoute();
  const online = /^\/g\/([A-Za-z0-9]{6})\/?$/.exec(path);
  if (online) {
    const code = online[1].toUpperCase();
    return (
      <>
        <nav class="topnav">
          <span class="brand">Field Command · {code}</span>
          <button class="link" onClick={() => navigate('/')}>Menu</button>
        </nav>
        <Online key={code} code={code} navigate={navigate} />
      </>
    );
  }
  if (path === '/results') {
    return (
      <>
        <nav class="topnav">
          <span class="brand">Field Command</span>
          <button class="link" onClick={() => navigate('/')}>Menu</button>
        </nav>
        <Results />
      </>
    );
  }
  return <Hotseat navigate={navigate} />;
}

function Hotseat({ navigate }: { navigate: (to: string) => void }) {
  const [saved, setSaved] = useState<Saved>(() => loadSaved() ?? MENU);
  const [inMenu, setInMenu] = useState(true);
  const { screen, game } = saved;
  useEffect(() => save(saved), [saved]);

  const state = useMemo(() => (game?.state ? deserializeState(game.state) : null), [game?.state]);
  const update = (g: HotseatGame, s: Screen) => setSaved({ screen: s, game: g });

  function newGame(maxDays?: number, computer?: { human: Side; level: Level }) {
    const fresh: HotseatGame = { maxDays, deployments: {}, state: null, orders: {}, history: [], computer };
    update(fresh, computer ? { name: 'deploy', side: computer.human } : { name: 'pass', to: 'blue', then: 'deploy' });
    setInMenu(false);
  }

  function start(g: HotseatGame, deployments: HotseatGame['deployments']) {
    const first = createGame(deployments.blue!, deployments.red!);
    const next = { ...g, deployments, state: serializeState(first) };
    update(next, g.computer ? { name: 'orders', side: g.computer.human } : { name: 'pass', to: 'blue', then: 'orders' });
  }

  function resolve(g: HotseatGame, orders: Record<Side, Order[]>) {
    const { state: next, events } = resolveDay(deserializeState(g.state!), orders, { maxDays: g.maxDays });
    const history = [...g.history, { day: next.day, events, before: g.state! }];
    update({ ...g, orders: {}, state: serializeState(next), history }, { name: 'reveal' });
  }

  function deployed(side: Side, d: Deployment) {
    const deployments = { ...game!.deployments, [side]: d };
    if (game!.computer) return update({ ...game!, deployments }, { name: 'thinking' });
    if (side === 'blue') return update({ ...game!, deployments }, { name: 'pass', to: 'red', then: 'deploy' });
    start(game!, deployments);
  }

  function ordered(side: Side, list: Order[]) {
    const orders = { ...game!.orders, [side]: list };
    if (game!.computer) return update({ ...game!, orders }, { name: 'thinking' });
    if (side === 'blue') return update({ ...game!, orders }, { name: 'pass', to: 'red', then: 'orders' });
    resolve(game!, { blue: orders.blue!, red: list });
  }

  // The computer's turn: runs whenever the "thinking" screen is showing (including after a reload).
  const thinkingFor = useRef('');
  useEffect(() => {
    if (screen.name !== 'thinking' || !game?.computer) return;
    const g = game;
    const { human, level } = g.computer!;
    const bot = opponent(human);
    const key = `${g.state?.day ?? 'deploy'}`;
    if (thinkingFor.current === key) return;
    thinkingFor.current = key;
    (async () => {
      if (!g.state) {
        start(g, { ...g.deployments, [bot]: await computerDeployment(level, bot) });
      } else {
        const theirs = await computerOrders(level, g.state, bot);
        resolve(g, { [human]: g.orders[human] ?? [], [bot]: theirs } as Record<Side, Order[]>);
      }
      thinkingFor.current = '';
    })().catch((e) => {
      thinkingFor.current = '';
      alert(`The computer player failed: ${e instanceof Error ? e.message : e}`);
    });
  }, [screen.name, game]);

  if (inMenu || !game || screen.name === 'menu') {
    const resumable = !!game && screen.name !== 'menu' && !state?.result;
    return (
      <Menu
        canResume={resumable} onResume={() => setInMenu(false)} onNew={(d) => newGame(d)}
        onComputer={(d, human, level) => newGame(d, { human, level })} navigate={navigate}
      />
    );
  }

  return (
    <>
      <nav class="topnav">
        <span class="brand">Field Command</span>
        <button class="link" onClick={() => setInMenu(true)}>Menu</button>
      </nav>
      {renderScreen(game)}
    </>
  );

  function renderScreen(game: HotseatGame) {
  switch (screen.name) {
    case 'pass': {
      const what = screen.then === 'deploy' ? 'Secretly deploy your army' : `Write your orders for day ${(state?.day ?? 0) + 1}`;
      return <Pass to={screen.to} what={what} onReady={() => update(game, { name: screen.then, side: screen.to })} />;
    }
    case 'deploy':
      return <Deploy key={screen.side} side={screen.side} onDone={(d) => deployed(screen.side, d)} />;
    case 'orders':
      return <Orders key={`${state!.day}-${screen.side}`} state={state!} side={screen.side} history={game.history} onSubmit={(o) => ordered(screen.side, o)} />;
    case 'thinking':
      return <Thinking game={game} />;
    case 'reveal': {
      const last = game.history[game.history.length - 1];
      const human = game.computer?.human;
      return (
        <Reveal
          key={last.day} before={deserializeState(last.before)} after={state!} events={last.events} history={game.history}
          view={human ?? 'blue'} you={human}
          onContinue={() => update(game, human ? { name: 'orders', side: human } : { name: 'pass', to: 'blue', then: 'orders' })}
          onNewGame={() => { setSaved(MENU); setInMenu(true); }}
        />
      );
    }
  }
  }
}

