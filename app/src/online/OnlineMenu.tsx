import { useEffect, useState } from 'preact/hooks';
import type { Side } from '@fc/engine';
import { SIDE_NAME } from '../labels.ts';
import { MAX_NAME, api, identities, lastName, parseGameInput, rememberName, saveIdentity, type PlayerView } from './api.ts';

function status(v: PlayerView | null | undefined): string {
  if (v === undefined) return '…';
  if (v === null) return 'unavailable';
  if (v.phase === 'over') return v.result?.winner ? `${SIDE_NAME[v.result.winner]} won` : 'draw';
  if (v.phase === 'deploy') {
    if (!v.myDeployment) return 'your move: deploy';
    return v.opponentJoined ? 'waiting for opponent' : 'waiting for opponent to join';
  }
  return v.myOrders ? 'waiting for opponent' : `your move: day ${v.history.length + 1}`;
}

export function OnlineMenu({ maxDays, navigate }: { maxDays?: number; navigate: (to: string) => void }) {
  const [side, setSide] = useState<Side>('blue');
  const [name, setName] = useState(lastName);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [games, setGames] = useState(() => identities());
  const [views, setViews] = useState<Record<string, PlayerView | null>>({});

  useEffect(() => {
    for (const [code, id] of Object.entries(games)) {
      api.view(code, id.token).then(
        (v) => setViews((s) => ({ ...s, [code]: v })),
        () => setViews((s) => ({ ...s, [code]: null })),
      );
    }
  }, [games]);

  async function create() {
    setBusy(true);
    setError('');
    try {
      rememberName(name);
      const g = await api.create(side, maxDays, name);
      saveIdentity(g.code, { token: g.token, side: g.side, seenDay: 0, added: Date.now() });
      navigate(`/g/${g.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function open() {
    const parsed = parseGameInput(input);
    if (!parsed) return setError('Enter a 6-character game code or paste a game link.');
    navigate(`/g/${parsed.code}${parsed.token ? `#t=${parsed.token}` : ''}`);
  }

  const list = Object.entries(games).sort((a, b) => b[1].added - a[1].added);
  return (
    <div class="card">
      <h2>Online game</h2>
      <p class="muted">Play on two devices. You get a link to send your opponent; no accounts needed.</p>
      <div class="row">
        <label class="field grow">
          Your name
          <input
            class="text" placeholder="optional" maxLength={MAX_NAME} value={name}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
      </div>
      <div class="row">
        <label class="field">
          Play as
          <select value={side} onChange={(e) => setSide(e.currentTarget.value as Side)}>
            <option value="blue">Blue</option>
            <option value="red">Red</option>
          </select>
        </label>
        <button class="primary" disabled={busy} onClick={create}>New online game</button>
      </div>
      <form class="row" onSubmit={(e) => { e.preventDefault(); open(); }}>
        <input
          class="text" placeholder="Game code or link" value={input} aria-label="Game code or link"
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button type="submit">Open a game</button>
      </form>
      {error && <p class="notice">{error}</p>}
      {list.length > 0 && (
        <>
          <h3>Your games</h3>
          <ul class="game-list">
            {list.map(([code, id]) => (
              <li key={code}>
                <a href={`/g/${code}`} onClick={(e) => { e.preventDefault(); navigate(`/g/${code}`); }}>
                  <span class={`dot ${id.side ?? ''}`} /> <b>{code}</b>
                  {views[code]?.opponentName && <span class="vs">vs {views[code]!.opponentName}</span>}
                </a>
                <span class={`status${status(views[code]).startsWith('your move') ? ' yours' : ''}`}>{status(views[code])}</span>
                <button
                  class="icon" aria-label={`Forget game ${code}`}
                  onClick={() => { if (confirm(`Remove game ${code} from this device? You can only get back in with your player link.`)) { saveIdentity(code, null); setGames(identities()); } }}
                >✕</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
