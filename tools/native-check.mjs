/**
 * Guards the Expo Go compatibility contract.
 *
 * Expo Go ships a fixed set of native binaries. Any package with native code whose JS version does
 * not match the embedded binary can fail at the TurboModule ABI boundary — an error that is
 * completely invisible in a web bundle and fatal on the handset. Web verification cannot catch it,
 * so it is checked statically here instead.
 *
 * This exists because react-native-worklets resolved to 0.8.3 (Reanimated's peer range is only
 * `>=0.5.0`) while Expo Go SDK 54 embeds 0.5.1, and the app died on device with
 * `installTurboModule called with 1 arguments (expected 0)`.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bundled = require('expo/bundledNativeModules.json');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));

/** Packages that carry native code and are embedded in Expo Go. Version must match exactly. */
const NATIVE = [
  'react-native-worklets',
  'react-native-reanimated',
  'react-native-gesture-handler',
  'react-native-screens',
  'react-native-safe-area-context',
  'react-native-svg',
];

const clean = (r) => (r ?? '').replace(/^[~^]/, '');
let failed = 0;

for (const name of NATIVE) {
  const expected = clean(bundled[name]);
  if (!expected) continue;

  let installed;
  try {
    installed = require(`${name}/package.json`).version;
  } catch {
    console.log(`SKIP  ${name.padEnd(32)} not installed`);
    continue;
  }

  // Transitive resolution is the trap: a package can be absent from `dependencies` and still be
  // loaded at runtime at whatever version a peer range allowed.
  const declared = pkg.dependencies?.[name];
  const ok = installed === expected;
  if (!ok) failed++;

  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(32)} installed=${installed.padEnd(9)} ` +
      `expoGo=${expected.padEnd(9)} ${declared ? `declared=${declared}` : 'NOT IN dependencies'}`,
  );
}

if (failed) {
  console.error(
    `\n${failed} native module(s) differ from what Expo Go SDK 54 embeds. ` +
      `Pin them exactly in package.json (and in "overrides" when they resolve transitively).`,
  );
  process.exit(1);
}
console.log('\nAll native modules match the Expo Go SDK 54 binaries.');
