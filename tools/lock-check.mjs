/**
 * Checks for the trinco's route rule — the one decision that stands between a deep link and the
 * ledger, and that no screenshot of an emulator without a fingerprint can exercise.
 *
 *   node --import ./tools/register-ts.mjs tools/lock-check.mjs
 */
import assert from 'node:assert/strict';
import { lockDecision, returnHref, safeNext } from '../src/lib/auth/guard.ts';

const shut = { signedIn: true, ready: true, enabled: true, unlocked: false };
const open = { ...shut, unlocked: true };

// --- Every way in that is not the launcher is behind the door ---------------------------------
for (const path of ['/home', '/razao', '/calendario', '/lancar', '/contas', '/ajustes', '/otto', '/divida/abc', '/qualquer-coisa']) {
  assert.equal(lockDecision(path, shut), 'lock', `${path} is locked while the trinco is shut`);
  assert.equal(lockDecision(path, open), 'open', `${path} opens once unlocked`);
  assert.equal(lockDecision(path, { ...shut, enabled: false }), 'open', `${path} with no trinco`);
  assert.equal(lockDecision(path, { ...shut, ready: false }), 'wait', `${path} waits for the probe, never flashes`);
}

// --- What never locks ---------------------------------------------------------------------------
for (const path of ['/', '/sign-in', '/sign-up', '/forgot', '/desbloquear']) {
  assert.equal(lockDecision(path, shut), 'open', `${path} stays open`);
  assert.equal(lockDecision(path, { ...shut, ready: false }), 'open', `${path} does not wait either`);
}
// Signed out there is no ledger to guard — the shared-debt page stays public, as on the web.
assert.equal(lockDecision('/divida/abc', { ...shut, signedIn: false }), 'open');
assert.equal(lockDecision('/home', { ...shut, signedIn: false, ready: false }), 'open');

// --- The destination survives the door -----------------------------------------------------------
assert.equal(returnHref('/home', ['home'], {}), '/home');
assert.equal(returnHref('/calendario', ['calendario'], { date: '2026-10-20' }), '/calendario?date=2026-10-20', 'a notification keeps its day');
assert.equal(returnHref('/divida/tok_1', ['divida', '[token]'], { token: 'tok_1' }), '/divida/tok_1', 'a path segment is not repeated as a query');
assert.equal(returnHref('/lancar', ['lancar'], { id: 'a b&c', x: undefined }), '/lancar?id=a+b%26c', 'values are encoded, absent ones dropped');

// --- And `next` is only ever an in-app path --------------------------------------------------------
assert.equal(safeNext('/calendario?date=2026-10-20'), '/calendario?date=2026-10-20');
assert.equal(safeNext('/divida/tok_1'), '/divida/tok_1');
for (const bad of [undefined, null, 42, ['/home'], '', 'home', '//evil.example', 'https://evil.example', '/\\evil', '/x?u=https://evil', '/desbloquear', '/desbloquear?next=/home', '/']) {
  assert.equal(safeNext(bad), null, `refuses ${JSON.stringify(bad)}`);
}

console.log('lock: every route but the doors is behind the trinco, and unlocking returns where it was going.');
