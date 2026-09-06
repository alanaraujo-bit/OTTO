/**
 * A one-file HTTP server for exactly one purpose: handing the built APK to a phone on the same
 * Wi-Fi, the same way the Expo dev server already hands it JS over exp://. No dependency beyond
 * Node's own http module — this never ships, it only runs on this machine for a few minutes.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR = join(import.meta.dirname, '..', 'builds');
const FILE = process.argv[2] ?? 'OTTO-0.1.0.apk';
const PATH = join(DIR, FILE);
const PORT = 8082;

const stat = statSync(PATH);

createServer((req, res) => {
  if (req.url !== '/' + FILE && req.url !== '/apk') {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${basename(PATH)}"`,
  });
  createReadStream(PATH).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`serving ${FILE} (${(stat.size / 1024 / 1024).toFixed(1)} MB) on port ${PORT}`);
});
