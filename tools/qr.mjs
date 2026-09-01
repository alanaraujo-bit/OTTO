/**
 * Prints the Expo Go QR to the terminal and writes a scannable PNG.
 * The tunnel host is stable for this project (`.expo/settings.json` pins the randomness), so the
 * PNG stays valid across dev-server restarts.
 */
import QRCode from 'qrcode';
import { readFile, writeFile } from 'node:fs/promises';

async function tunnelUrl() {
  try {
    const res = await fetch('http://localhost:4040/api/tunnels', { signal: AbortSignal.timeout(4000) });
    const json = await res.json();
    const https = json.tunnels.find((t) => t.public_url.startsWith('https://'));
    if (https) return `exp://${https.public_url.replace('https://', '')}`;
  } catch {
    // Dev server not up — fall back to the pinned host below.
  }
  const settings = JSON.parse(await readFile('.expo/settings.json', 'utf8'));
  return `exp://${settings.urlRandomness.toLowerCase()}-anonymous-8081.exp.direct`;
}

const url = await tunnelUrl();
console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
console.log(`  Expo Go  ->  ${url}\n`);
await QRCode.toFile('otto-qr.png', url, { width: 640, margin: 2, color: { dark: '#08090B', light: '#FFFFFF' } });
await writeFile('.expo-url.txt', `${url}\n`);
console.log('  PNG: otto-qr.png');
