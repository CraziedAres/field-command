// Prints a fresh VAPID key pair for web push. Put them in server/.dev.vars (local) and
// `wrangler secret put VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_JWK` (production).
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const b64url = (b) => Buffer.from(b).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_JWK=${JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey))}`);
