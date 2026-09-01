/**
 * Device-accurate capture + inspection harness for OTTO.
 *
 * The target is a Motorola Edge 60 Fusion: 1220x2712 physical, 446ppi. Android reports it as a
 * ~2.75x density, giving a ~444 x 986dp logical viewport. Everything is captured at that geometry so
 * what shows up here is what shows up on the handset.
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.OTTO_BASE ?? 'http://localhost:8081';
const OUT = process.env.OTTO_OUT ?? 'shots';

/** Physical panel / density -> logical dp. Insets approximate the real status + gesture bars. */
export const DEVICE = {
  width: 444,
  height: 986,
  dpr: 2.75,
  statusBar: 28,
  navBar: 20,
};

const ROUTES = (process.env.OTTO_ROUTES ?? 'sign-in,sign-up,forgot').split(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
  });

  const report = [];

  for (const route of ROUTES) {
    const page = await browser.newPage();
    await page.setViewport({
      width: DEVICE.width,
      height: DEVICE.height,
      deviceScaleFactor: DEVICE.dpr,
      isMobile: true,
      hasTouch: true,
    });

    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${String(e).slice(0, 300)}`));

    await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await sleep(2200);

    // Overflow is the defect that a screenshot alone reports ambiguously — measure it.
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const viewport = doc.clientWidth;
      const offenders = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > viewport + 0.5 || r.left < -0.5) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className?.baseVal ?? el.className ?? '').toString().slice(0, 40),
            text: (el.textContent ?? '').trim().slice(0, 30),
            left: +r.left.toFixed(1),
            right: +r.right.toFixed(1),
            width: +r.width.toFixed(1),
          });
        }
      }
      // Report only the outermost offenders; children inherit the parent's overflow.
      const trimmed = offenders.filter(
        (o, _i, all) => !all.some((p) => p !== o && p.left <= o.left && p.right >= o.right && p.width > o.width),
      );
      return {
        viewport,
        scrollWidth: doc.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        offenders: trimmed.slice(0, 8),
      };
    });

    const file = `${OUT}/${route}.png`;
    await page.screenshot({ path: file });

    report.push({ route, ...metrics, errors: errors.slice(0, 6) });
    await page.close();
  }

  await browser.close();
  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
