import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vapidJwt } from '../src/push.ts';

test('VAPID JWT is ES256-signed by the private key and verifies with the public key', async () => {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = Buffer.from(await crypto.subtle.exportKey('raw', publicKey)).toString('base64url');
  const vapid = { publicKey: raw, privateJwk: (await crypto.subtle.exportKey('jwk', privateKey)) as JsonWebKey, subject: 'https://example.test' };
  const jwt = await vapidJwt('https://push.example.com', vapid, 1_700_000_000_000);
  const [header, claims, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url').toString()), {
    aud: 'https://push.example.com', exp: 1_700_000_000 + 12 * 3600, sub: 'https://example.test',
  });
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, publicKey, Buffer.from(sig, 'base64url'), new TextEncoder().encode(`${header}.${claims}`),
  );
  assert.ok(ok);
  assert.equal(Buffer.from(sig, 'base64url').length, 64); // raw r||s, as JWS requires
});
