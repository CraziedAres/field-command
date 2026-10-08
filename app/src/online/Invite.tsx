import { useState } from 'preact/hooks';
import { inviteLink, playerLink } from './api.ts';

async function copy(text: string, done: (s: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    done('Copied');
  } catch {
    done(text);
  }
}

export function Invite({ code }: { code: string }) {
  const [note, setNote] = useState('');
  const link = inviteLink(code);
  return (
    <div class="invite">
      <p class="muted small">Send this to your opponent:</p>
      <p class="code">{code}</p>
      <div class="row tight">
        <button onClick={() => copy(link, setNote)}>Copy invite link</button>
        {'share' in navigator && (
          <button onClick={() => navigator.share({ title: 'Field Command', text: `Join my Field Command game: ${code}`, url: link }).catch(() => {})}>
            Share…
          </button>
        )}
      </div>
      {note && <p class="muted small">{note}</p>}
    </div>
  );
}

/** A private link that restores this seat elsewhere (e.g. in the installed app, which has its own storage on iOS). */
export function PlayerLink({ code, token }: { code: string; token: string }) {
  const [note, setNote] = useState('');
  return (
    <details class="player-link">
      <summary>Play on another device</summary>
      <p class="muted small">
        This link is your seat in this game; keep it private. Open it (or paste it under "Open a game") on another device or in
        the installed app.
      </p>
      <button onClick={() => copy(playerLink(code, token), setNote)}>Copy my player link</button>
      {note && <p class="muted small">{note}</p>}
    </details>
  );
}
