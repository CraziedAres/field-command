import { useEffect, useState } from 'preact/hooks';
import { identities } from '../online/api.ts';
import { installPrompt, isStandalone, justInstalled, onInstallChange, platform, promptInstall } from '../install.ts';

const HIDE_KEY = 'field-command.install-hidden.v1';

function hidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Menu card with install steps for this device. Not shown inside the installed app or once dismissed. */
export function InstallCard() {
  const [, rerender] = useState(0);
  const [dismissed, setDismissed] = useState(hidden);
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);

  if (dismissed || isStandalone()) return null;

  function hide() {
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      // storage unavailable: hide for this visit only
    }
    setDismissed(true);
  }

  const p = platform();
  const canPrompt = !!installPrompt();
  // iOS and Safari's "Add to Dock" apps keep their own storage, so online games don't follow on their own.
  const separateStorage = p === 'ios' || p === 'mac-safari';
  const hasOnlineGames = Object.keys(identities()).length > 0;

  let steps;
  if (justInstalled()) {
    steps = <p>Installed. Open Field Command from your home screen or app list.</p>;
  } else if (canPrompt) {
    steps = (
      <div class="row tight">
        <button class="primary" onClick={() => promptInstall()}>Install the app</button>
      </div>
    );
  } else if (p === 'ios') {
    steps = (
      <ol>
        <li>Tap the <b>Share</b> button (the square with an arrow; in Chrome it's in the address bar).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open Field Command from your Home Screen. Notifications only work from there (iOS 16.4 or later).</li>
      </ol>
    );
  } else if (p === 'android') {
    steps = (
      <ol>
        <li>Open the browser menu (<b>⋮</b> in Chrome).</li>
        <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
      </ol>
    );
  } else if (p === 'mac-safari') {
    steps = (
      <ol>
        <li>In Safari's menu bar choose <b>File → Add to Dock…</b> (Safari 17 / macOS Sonoma or later).</li>
        <li>Open Field Command from the Dock.</li>
      </ol>
    );
  } else {
    steps = (
      <p>
        In Chrome or Edge, click the install icon at the right of the address bar, or look for <b>Install</b> in the browser
        menu. Firefox can't install web apps on desktop.
      </p>
    );
  }

  return (
    <div class="card install">
      <div class="install-head">
        <h2>Install the app</h2>
        <button class="icon" aria-label="Hide install instructions" onClick={hide}>✕</button>
      </div>
      <p class="muted small">Field Command works as an app: its own icon, full screen and move notifications. No app store needed.</p>
      {steps}
      {separateStorage && hasOnlineGames && !justInstalled() && (
        <p class="muted small">
          The installed app keeps its own storage, so your current online games won't appear in it by themselves. In each game,
          use <b>Play on another device</b> to copy your player link, then paste it under "Open a game" in the app.
        </p>
      )}
    </div>
  );
}
