// Captures the real OTTO app (Expo web build of the actual source) with the app's own demo ledger.
// The API is answered locally from ledger.json so no production account or data is touched.
// Usage: node shoot.mjs <outDir> <route>[:name] ...   (route like /home, /razao)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(path.join(process.env.APPDATA, 'npm/node_modules/@playwright/cli/node_modules/'));
const { chromium } = require('playwright-core');

const BASE = process.env.OTTO_WEB || 'http://localhost:8099';
const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
let ledger = JSON.parse(fs.readFileSync(path.join(here, 'ledger.json'), 'utf8'));
const FAKE_NOW = process.env.FAKE_NOW || '2026-10-22T12:40:00-03:00';

export async function open({ scale = 3, width = 412, height = 915 } = {}) {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, isMobile: true, hasTouch: true,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'dark',
  });
  await ctx.clock.install({ time: new Date(FAKE_NOW) });
  await ctx.addInitScript(() => {
    localStorage.setItem('otto.session.v1', JSON.stringify({
      id: 'demo', name: 'Alan', email: 'demo@otto.local', provider: 'password', createdAt: Date.now(), accessToken: 'demo-token',
    }));
  });
  await ctx.route('http://127.0.0.1:9/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.pathname === '/v1/ledger' && req.method() === 'GET') return route.fulfill({ json: ledger });
    if (u.pathname === '/v1/ledger' && req.method() === 'PUT') { ledger = JSON.parse(req.postData()); return route.fulfill({ json: ledger }); }
    if (u.pathname.endsWith('/share')) return route.fulfill({ status: 200, json: null });
    return route.fulfill({ status: 404, json: { error: 'not in capture mock' } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  return { browser, ctx, page };
}

export async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.clock.runFor(ms).catch(() => {});
  await page.waitForTimeout(400);
}

if (process.argv[1] && process.argv[1].endsWith('shoot.mjs')) {
  const [out, ...routes] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const { browser, page } = await open();
  for (const r of routes) {
    const [route, name] = r.split(':');
    await page.goto(BASE + route);
    await settle(page, 3000);
    const file = path.join(out, `${name || route.replace(/\W+/g, '_')}.png`);
    await page.screenshot({ path: file });
    console.log('shot', file);
  }
  await browser.close();
}
