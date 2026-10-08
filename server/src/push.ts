/**
 * Minimal Web Push: a VAPID-signed (ES256 JWT) request with no payload. Without a payload nothing needs
 * encrypting; the service worker shows a fixed "your move" notification.
 */
export interface Vapid {
  /** Uncompressed P-256 public key, base64url (the browser's applicationServerKey). */
  publicKey: string;
  /** Matching private key as a JWK. */
  privateJwk: JsonWebKey;
  /** Contact for push services: a mailto: or https: URL. */
  subject: string;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = (s: string): string => b64url(new TextEncoder().encode(s));

export async function vapidJwt(audience: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const header = b64urlText(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64urlText(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(new Uint8Array(sig))}`;
}

/** Returns the push service's HTTP status; 404 or 410 means the subscription is gone. */
export async function sendPush(endpoint: string, vapid: Vapid): Promise<number> {
  const jwt = await vapidJwt(new URL(endpoint).origin, vapid);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Urgency: 'high', Authorization: `vapid t=${jwt}, k=${vapid.publicKey}` },
  });
  return res.status;
}
