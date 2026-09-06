/**
 * Asserts that motion actually runs, rather than photographing a resting screen and hoping.
 *
 * Every check samples a computed value over time and requires it to change in the right direction.
 * A still frame cannot tell a staggered entrance from an instant one.
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8081';
const OUT = 'shots';
const VIEW = { width: 444, height: 986, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
});
await mkdir(OUT, { recursive: true });

async function open(route, wait = 'domcontentloaded') {
  const page = await browser.newPage();
  await page.setViewport(VIEW);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  await page.goto(`${BASE}/${route}`, { waitUntil: wait, timeout: 120000 });
  return { page, errors };
}

/** Opacity of the element containing a given text, walking up to the animated wrapper. */
const opacityOf = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => d.textContent?.trim().startsWith(t) && d.children.length <= 3,
    );
    if (!el) return null;
    for (let n = el; n; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (o < 0.999) return o;
    }
    return 1;
  }, text);

// 1. The ruling sequence must ramp, not snap.
{
  const { page, errors } = await open('sign-in');
  const samples = [];
  for (let i = 0; i < 14; i++) {
    samples.push(await opacityOf(page, 'Bom te ver'));
    await sleep(70);
  }
  const seen = samples.filter((v) => v !== null);
  const partial = seen.filter((v) => v > 0.01 && v < 0.99).length;
  check(
    'entrada em rampa (nao snap)',
    partial >= 1,
    `${partial} quadros intermediarios; amostras=[${seen.slice(0, 8).map((v) => v?.toFixed(2)).join(', ')}]`,
  );
  check('entrada sem erro', errors.length === 0, errors[0] ?? 'nenhum');
  await page.close();
}

// 2. Focus must warm the rim light.
{
  const { page, errors } = await open('sign-in');
  await sleep(2400);
  const rim = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="otto-rim"]');
      return el ? parseFloat(getComputedStyle(el).opacity) : null;
    });
  const before = await rim();
  const [email] = await page.$$('input');
  await email.click();
  await sleep(700);
  const after = await rim();
  check(
    'rim light responde ao foco',
    before !== null && after !== null && after > before + 0.05,
    `antes=${before} depois=${after}`,
  );
  await page.screenshot({ path: `${OUT}/motion-focus.png` });
  check('foco sem erro', errors.length === 0, errors[0] ?? 'nenhum');
  await page.close();
}

// 3. A rejected value must nudge the field sideways.
{
  const { page, errors } = await open('sign-in');
  await sleep(2400);
  for (const b of await page.$$('[role="button"]')) {
    if ((await page.evaluate((el) => el.getAttribute('aria-label'), b)) === 'Entrar') {
      await b.click();
      break;
    }
  }
  const xs = [];
  for (let i = 0; i < 10; i++) {
    xs.push(
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find((d) =>
          d.textContent?.trim().startsWith('E-MAIL'),
        );
        return el ? el.getBoundingClientRect().left : null;
      }),
    );
    await sleep(35);
  }
  const clean = xs.filter((v) => v !== null);
  const spread = Math.max(...clean) - Math.min(...clean);
  check('erro empurra o campo', spread > 1, `deslocamento=${spread.toFixed(1)}px`);
  await page.screenshot({ path: `${OUT}/motion-error.png` });
  check('erro sem erro de runtime', errors.length === 0, errors[0] ?? 'nenhum');
  await page.close();
}

// 4. The CTA must confirm before the route changes.
{
  const { page, errors } = await open('sign-in');
  await sleep(2400);
  const [email, pass] = await page.$$('input');
  await email.click(); await email.type('alan@otto.app', { delay: 6 });
  await pass.click(); await pass.type('senha-forte-2026', { delay: 6 });
  for (const b of await page.$$('[role="button"]')) {
    if ((await page.evaluate((el) => el.getAttribute('aria-label'), b)) === 'Entrar') {
      await b.click();
      break;
    }
  }
  await sleep(780);
  const svgInCta = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="button"]')].find(
      (el) => el.getAttribute('aria-label') === 'Entrar',
    );
    return b ? b.querySelectorAll('svg').length : -1;
  });
  await page.screenshot({ path: `${OUT}/motion-success.png` });
  check('CTA confirma com marca', svgInCta > 0, `svgs no botao=${svgInCta}`);
  await sleep(900);
  check('navega depois de confirmar', page.url().endsWith('/home'), `url=${page.url()}`);
  check('sucesso sem erro', errors.length === 0, errors[0] ?? 'nenhum');
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checagens de movimento passaram.`);
process.exit(failed ? 1 : 0);
