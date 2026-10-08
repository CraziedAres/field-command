import { useState } from 'preact/hooks';
import { api, saveIdentity, type Identity } from './api.ts';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Opt in to a push notification whenever it's this player's move. */
export function Notify({ code, id, onChange }: { code: string; id: Identity; onChange: (id: Identity) => void }) {
  const [status, setStatus] = useState('');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (!supported) {
    return (
      <p class="muted small">
        {isIos() && !isStandalone()
          ? 'On iPhone and iPad, notifications need the app on your Home Screen: tap Share → Add to Home Screen, open it from there, and use "Open a game" with your player link (below).'
          : "This browser can't show notifications. The page updates by itself while it's open."}
      </p>
    );
  }
  if (id.push && Notification.permission === 'granted') return <p class="small ok">🔔 Notifications are on for this game.</p>;
  if (Notification.permission === 'denied') return <p class="muted small">Notifications are blocked for this site in your browser settings.</p>;

  async function enable() {
    try {
      setStatus('Asking…');
      if ((await Notification.requestPermission()) !== 'granted') return setStatus('Permission was not given.');
      const key = await api.vapidKey();
      if (!key) return setStatus('The server has no push keys configured.');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      await api.push(code, id.token, sub.toJSON());
      const next = { ...id, push: true };
      saveIdentity(code, next);
      onChange(next);
      setStatus('');
    } catch (e) {
      setStatus(`Couldn't turn on notifications: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <div>
      <button onClick={enable}>🔔 Notify me when it's my move</button>
      {status && <p class="muted small">{status}</p>}
    </div>
  );
}
