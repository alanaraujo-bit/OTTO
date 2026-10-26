// Sends scene scripts to the running After Effects: lib.jsx + scenes/<name>.jsx, one call each.
// Usage: node build.mjs [scene ...]   (no args = full chain; S2 recreates the phone rig, so 03-07 must follow it)
import fs from 'node:fs';
import path from 'node:path';
import { runJsx } from '../tools/ae-mcp/ae-bridge.mjs';
const dir = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), 'ae');
const lib = fs.readFileSync(path.join(dir, 'lib.jsx'), 'utf8');
const ALL = ['01_s1', '02_s2', '03_s3', '04_s4', '05_s5', '06_s6', '07_s7'];
const args = process.argv.slice(2);
for (const s of args.length ? args : ALL) {
  const r = await runJsx(lib + '\n' + fs.readFileSync(path.join(dir, s + '.jsx'), 'utf8'));
  console.log(s, JSON.stringify(r));
  if (!r.ok) process.exit(1);
}
