/**
 * Drives the real UI to capture the states a static screenshot never shows: focus, validation
 * errors, the strength meter, and the reset confirmation.
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8081';
const OUT = 'shots';
const VIEW = { width: 444, height: 986, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(browser, route) {
  const page = await browser.newPage();
  await page.setViewport(VIEW);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await sleep(2000);
  return { page, errors };
}

const inputs = (page) => page.$$('input');

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'],
  });
  const log = [];

  // 1. Validation errors — submit an empty form.
  {
    const { page, errors } = await open(browser, 'sign-in');
    const buttons = await page.$$('[role="button"]');
    for (const b of buttons) {
      const label = await page.evaluate((el) => el.getAttribute('aria-label'), b);
      if (label === 'Entrar') { await b.click(); break; }
    }
    await sleep(700);
    await page.screenshot({ path: `${OUT}/state-signin-errors.png` });
    log.push({ shot: 'signin-errors', errors });
    await page.close();
  }

  // 2. Focus state with real input.
  {
    const { page, errors } = await open(browser, 'sign-in');
    const [email, pass] = await inputs(page);
    await email.click();
    await email.type('alanvitoraraujo004@gmail.com', { delay: 12 });
    await pass.click();
    await pass.type('senha-forte-123', { delay: 12 });
    await sleep(600);
    await page.screenshot({ path: `${OUT}/state-signin-filled.png` });
    log.push({ shot: 'signin-filled', errors });
    await page.close();
  }

  // 3. Strength meter across the whole range.
  for (const [name, pwd] of [['weak', 'abc'], ['good', 'Senha1234'], ['best', 'Senha#Forte2026!']]) {
    const { page, errors } = await open(browser, 'sign-up');
    const [nm, em, pw] = await inputs(page);
    await nm.click(); await nm.type('Alan', { delay: 10 });
    await em.click(); await em.type('alan@otto.app', { delay: 10 });
    await pw.click(); await pw.type(pwd, { delay: 10 });
    await sleep(600);
    await page.screenshot({ path: `${OUT}/state-signup-${name}.png` });
    log.push({ shot: `signup-${name}`, errors });
    await page.close();
  }

  // 4. Google button -> the not-configured snackbar must actually surface.
  {
    const { page, errors } = await open(browser, 'sign-in');
    const buttons = await page.$$('[role="button"]');
    for (const b of buttons) {
      const label = await page.evaluate((el) => el.getAttribute('aria-label'), b);
      if (label === 'Continuar com Google') { await b.click(); break; }
    }
    await sleep(1600);
    await page.screenshot({ path: `${OUT}/state-snackbar.png` });
    const snack = await page.evaluate(() => document.body.innerText.includes('Google'));
    log.push({ shot: 'snackbar', snackVisible: snack, errors });
    await page.close();
  }

  // 5. Password reset confirmation.
  {
    const { page, errors } = await open(browser, 'forgot');
    const [em] = await inputs(page);
    await em.click(); await em.type('alan@otto.app', { delay: 10 });
    const buttons = await page.$$('[role="button"]');
    for (const b of buttons) {
      const label = await page.evaluate((el) => el.getAttribute('aria-label'), b);
      if (label === 'Enviar link') { await b.click(); break; }
    }
    await sleep(1800);
    await page.screenshot({ path: `${OUT}/state-forgot-sent.png` });
    log.push({ shot: 'forgot-sent', errors });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(log, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
