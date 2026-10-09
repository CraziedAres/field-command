import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  KINDS, deserializeState, opponent, resolveDay, serializeState, sideOfUnit, sq,
  type Deployment, type GameState, type Order, type Side,
} from '@fc/engine';
import { Board, type UnitView } from '../components/Board.tsx';
import { Deploy } from '../screens/Deploy.tsx';
import { Log } from '../screens/Log.tsx';
import { Orders } from '../screens/Orders.tsx';
import { Reveal } from '../screens/Reveal.tsx';
import { SIDE_NAME, describe } from '../labels.ts';
import type { DayRecord } from '../store.ts';
import {
  ApiError, MAX_NAME, api, identities, lastName, rememberName, saveIdentity, socketUrl, type Identity, type PlayerView,
} from './api.ts';
import { Invite, PlayerLink } from './Invite.tsx';
import { Notify } from './Notify.tsx';

/** Take a player token from a "#t=…" player link, then drop it from the address bar. */
function identityFromUrl(code: string): Identity | null {
  const m = /^#t=([0-9a-f]{32})$/.exec(location.hash);
  if (!m) return identities()[code] ?? null;
  history.replaceState(null, '', location.pathname);
  const existing = identities()[code];
  const id: Identity = existing?.token === m[1] ? existing : { token: m[1], seenDay: 0, added: Date.now() };
  saveIdentity(code, id);
  return id;
}

export function Online({ code, navigate }: { code: string; navigate: (to: string) => void }) {
  const [id, setIdState] = useState<Identity | null>(() => identityFromUrl(code));
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const setId = (next: Identity | null) => {
    saveIdentity(code, next);
    setIdState(next);
  };

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const v = await api.view(code, id.token);
      setView(v);
      setError('');
      if (id.side !== v.you) setId({ ...id, side: v.you });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (e instanceof ApiError && e.status === 403) setId(null); // stale token: offer to join again
    }
  }, [id?.token]);

  useEffect(() => void refresh(), [refresh]);

  // Live updates: the server pings this socket whenever the game changes.
  useEffect(() => {
    if (!id) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      ws = new WebSocket(socketUrl(code, id.token));
      ws.onmessage = (e) => e.data === 'update' && refresh();
      ws.onclose = () => {
        if (!closed) retry = setTimeout(open, 4000);
      };
    };
    open();
    const ping = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 30000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(ping);
      ws?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id?.token, refresh]);

  // Rebuild every day from the initial positions and both sides' orders.
  const replay = useMemo(() => {
    if (!view?.initial) return null;
    const states: GameState[] = [deserializeState(view.initial)];
    const records: DayRecord[] = view.history.map((orders, i) => {
      const r = resolveDay(states[i], orders, { maxDays: view.maxDays });
      states.push(r.state);
      return { day: i + 1, events: r.events, before: serializeState(states[i]) };
    });
    return { states, records };
  }, [view?.initial, view?.history.length]);

  async function act(fn: () => Promise<PlayerView>) {
    setBusy(true);
    try {
      setView(await fn());
      setError('');
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!id) return <Join code={code} onJoined={setId} navigate={navigate} />;
  if (!view) return <div class="center-msg">{error ? <p class="notice">{error}</p> : <p class="muted">Loading game {code}…</p>}</div>;

  const side = view.you;
  const foe = opponent(side);
  const foeName = view.opponentName ?? SIDE_NAME[foe];
  const errorBox = error && <p class="notice">{error}</p>;
  const sidebar = (
    <>
      <Names view={view} onRename={(n) => act(() => api.rename(code, id.token, n))} />
      {!view.opponentJoined && <Invite code={code} />}
      {view.phase !== 'over' && <Notify code={code} id={id} onChange={setId} />}
      <PlayerLink code={code} token={id.token} />
    </>
  );

  // Show each newly resolved day's reveal once.
  if (replay && id.seenDay < replay.records.length) {
    const i = id.seenDay;
    const rec = replay.records[i];
    return (
      <Reveal
        key={rec.day} view={side} you={side} before={deserializeState(rec.before)} after={replay.states[i + 1]} events={rec.events}
        history={replay.records.slice(0, i + 1)} endLabel="Back to menu"
        onContinue={() => setId({ ...id, seenDay: i + 1 })}
        onNewGame={() => { setId({ ...id, seenDay: i + 1 }); navigate('/'); }}
      />
    );
  }

  if (view.phase === 'deploy') {
    if (!view.myDeployment) {
      return (
        <>
          {(errorBox || !view.opponentJoined) && (
            <div class="screen banner-wrap">{errorBox}{!view.opponentJoined && <Invite code={code} />}</div>
          )}
          <Deploy key={side} side={side} onDone={(d) => act(() => api.deploy(code, id.token, d))} />
        </>
      );
    }
    const msg = !view.opponentJoined ? `Waiting for an opponent to join game ${code}.` : `Waiting for ${foeName} to deploy.`;
    return (
      <Waiting title="Deployment sent" side={side} units={deploymentUnits(view.myDeployment, side)} message={msg}>
        {errorBox}{sidebar}
      </Waiting>
    );
  }

  const state = replay!.states[replay!.states.length - 1];
  const history = replay!.records;

  if (view.phase === 'over') {
    const r = view.result!;
    return (
      <Waiting title={!r.winner ? 'Draw' : r.winner === side ? 'You win!' : 'You lose'} side={side} units={stateUnits(state)}
        message={describe({ type: 'end', result: r }, state.kind)}>
        <button class="primary big" onClick={() => navigate('/')}>Back to menu</button>
        <h3>Log</h3>
        <Log history={history} kinds={state.kind} />
      </Waiting>
    );
  }

  if (!view.myOrders || editing) {
    return (
      <>
        {errorBox && <div class="screen banner-wrap">{errorBox}</div>}
        <Orders
          key={`${state.day}-${editing}`} state={state} side={side} history={history} busy={busy} initial={view.myOrders ?? []}
          extra={<div class="extra">{sidebar}</div>}
          onSubmit={(o: Order[]) => act(() => api.orders(code, id.token, state.day + 1, o))}
        />
      </>
    );
  }

  return (
    <Waiting
      title={`Day ${state.day + 1} · orders sent`} side={side} units={stateUnits(state)}
      arrows={view.myOrders} message={`Waiting for ${foeName}'s orders. You can change yours until they arrive.`}
    >
      <button onClick={() => setEditing(true)}>Change my orders</button>
      {errorBox}{sidebar}
      <h3>Log</h3>
      <Log history={history} kinds={state.kind} />
    </Waiting>
  );
}

function Waiting({ title, side, units, arrows, message, children }: {
  title: string; side: Side; units: UnitView[]; arrows?: Order[]; message: string; children?: ComponentChildren;
}) {
  return (
    <div class="screen">
      <header class="bar"><h2><span class={`dot ${side}`} />{title}</h2></header>
      <div class="layout">
        <div class="board-wrap">
          <Board view={side} units={units} arrows={arrows?.map((o, i) => ({ key: i, from: o.from, to: o.to, side, ok: true }))} />
        </div>
        <aside class="panel">
          <p class="waiting">{message}</p>
          {children}
        </aside>
      </div>
    </div>
  );
}

const deploymentUnits = (d: Deployment, side: Side): UnitView[] =>
  Object.entries(d).map(([name, kind]) => ({ key: name, side, kind, sq: sq(name) }));

const stateUnits = (s: GameState): UnitView[] => {
  const out: UnitView[] = [];
  s.pos.forEach((p, u) => p >= 0 && out.push({ key: u, side: sideOfUnit(u), kind: KINDS[s.kind[u]], sq: p }));
  return out;
};

/** Both players' names, with an inline editor for your own. */
function Names({ view, onRename }: { view: PlayerView; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const foe = opponent(view.you);
  if (draft !== null) {
    return (
      <form class="names row" onSubmit={(e) => { e.preventDefault(); rememberName(draft); onRename(draft); setDraft(null); }}>
        <input
          class="text" placeholder="Your name" maxLength={MAX_NAME} value={draft} aria-label="Your name" autoFocus
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
        <button type="submit" class="primary">Save</button>
        <button type="button" onClick={() => setDraft(null)}>Cancel</button>
      </form>
    );
  }
  return (
    <p class="names">
      <span class={`dot ${view.you}`} /><b>{view.myName ?? 'You'}</b>
      <button class="link" onClick={() => setDraft(view.myName ?? '')}>{view.myName ? 'rename' : 'set name'}</button>
      <span class="muted"> vs </span>
      <span class={`dot ${foe}`} /><b>{view.opponentJoined ? view.opponentName ?? SIDE_NAME[foe] : '…'}</b>
    </p>
  );
}

function Join({ code, onJoined, navigate }: { code: string; onJoined: (id: Identity) => void; navigate: (to: string) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(lastName);
  async function join() {
    setBusy(true);
    try {
      rememberName(name);
      const { token, side } = await api.join(code, name);
      onJoined({ token, side, seenDay: 0, added: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="pass">
      <p class="eyebrow">Invitation</p>
      <h1>Game {code}</h1>
      <p>You've been invited to a game of Field Command.</p>
      <label class="field join-name">
        Your name
        <input
          class="text" placeholder="optional" maxLength={MAX_NAME} value={name}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      <button class="primary big" disabled={busy} onClick={join}>Join this game</button>
      {error && (
        <p class="notice">
          {error}. If you're already playing in it, open your player link from the device you joined on.
        </p>
      )}
      <button class="link" onClick={() => navigate('/')}>Back to menu</button>
    </div>
  );
}
