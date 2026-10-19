/**
 * Checks for Google sign-in's trust boundary: which ID tokens the API accepts — no network.
 *
 *   npm run google
 *
 * `googleIdentity` is the only thing standing between a token from the internet and a signed-in
 * session, so every way a token can be wrong is pinned here against a fake tokeninfo endpoint.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GOOGLE_CLIENT_IDS, googleIdentity } from '../api/src/google.js';

// Read as text: config.ts imports react-native, which Node cannot load.
const appClientIds = readFileSync(new URL('../src/lib/auth/config.ts', import.meta.url), 'utf8')
  .match(/[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/g);

const good = {
  iss: 'https://accounts.google.com',
  aud: GOOGLE_CLIENT_IDS[0],
  sub: '1234567890',
  email: 'Dono@Gmail.com',
  email_verified: 'true',
  name: 'Dono do OTTO',
};

const answering = (status, claims) => async () => ({ ok: status === 200, json: async () => claims });

assert.deepEqual(
  [...GOOGLE_CLIENT_IDS].sort(),
  [...appClientIds].sort(),
  'server and app name the same two Google clients',
);

assert.deepEqual(await googleIdentity('t', answering(200, good)), { sub: '1234567890', email: 'dono@gmail.com', name: 'Dono do OTTO' });
assert.equal((await googleIdentity('t', answering(200, { ...good, aud: GOOGLE_CLIENT_IDS[1], iss: 'accounts.google.com' })))?.sub, '1234567890', 'web client, bare issuer');
assert.equal((await googleIdentity('t', answering(200, { ...good, email_verified: true })))?.sub, '1234567890', 'boolean email_verified');
assert.equal((await googleIdentity('t', answering(200, { ...good, name: undefined })))?.name, 'dono', 'falls back to the address');

assert.equal(await googleIdentity('t', answering(200, { ...good, aud: 'someone-else.apps.googleusercontent.com' })), null, 'token for another app');
assert.equal(await googleIdentity('t', answering(200, { ...good, iss: 'https://evil.example' })), null, 'foreign issuer');
assert.equal(await googleIdentity('t', answering(200, { ...good, email_verified: 'false' })), null, 'unverified address');
assert.equal(await googleIdentity('t', answering(200, { ...good, email: undefined })), null, 'no address');
assert.equal(await googleIdentity('t', answering(200, { ...good, sub: '' })), null, 'no subject');
assert.equal(await googleIdentity('t', answering(400, { error: 'invalid_token' })), null, 'Google rejects it');
assert.equal(await googleIdentity('t', async () => { throw new Error('offline'); }), null, 'Google unreachable');
for (const bad of [undefined, null, 42, '', 'x'.repeat(4097)]) {
  assert.equal(await googleIdentity(bad, answering(200, good)), null, `malformed token ${String(bad).slice(0, 10)}`);
}

console.log('google: ok');
