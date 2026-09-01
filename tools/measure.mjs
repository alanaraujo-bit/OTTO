/** Reports the real vertical gaps so spacing is tuned from measurements, not from eyeballing. */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const routes = (process.env.OTTO_ROUTES ?? 'sign-in,sign-up').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

for (const route of routes) {
  const page = await browser.newPage();
  await page.setViewport({ width: 444, height: 986, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:8081/${route}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await sleep(1800);

  const m = await page.evaluate(() => {
    const H = innerHeight;
    const pick = (pred) =>
      [...document.querySelectorAll('div,span,svg')].find((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.width > 0 && pred(el, r);
      });
    const byText = (t) =>
      [...document.querySelectorAll('div')].find(
        (el) => el.textContent?.trim() === t && el.getBoundingClientRect().height > 0,
      );
    const svg = pick((el) => el.tagName.toLowerCase() === 'svg' && el.getAttribute('aria-label') === 'OTTO');
    const heading = [...document.querySelectorAll('div')].find((el) =>
      /Bom te ver|Vamos come/.test(el.textContent ?? '') && el.children.length === 0,
    );
    const cta = [...document.querySelectorAll('[role="button"]')].find((el) =>
      ['Entrar', 'Criar conta'].includes(el.getAttribute('aria-label') ?? ''),
    );
    const social = [...document.querySelectorAll('[role="button"]')].find(
      (el) => el.getAttribute('aria-label') === 'Continuar com Apple',
    );
    const footer = byText('Entrar') ?? byText('Criar conta');
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const round = (n) => (n == null ? null : Math.round(n));
    const rb = r(svg), rh = r(heading), rc = r(cta), rs = r(social), rf = r(footer);
    return {
      viewportH: H,
      brandTop: round(rb?.top),
      brandBottom: round(rb?.bottom),
      gapBrandToHeading: round(rh && rb ? rh.top - rb.bottom : null),
      headingTop: round(rh?.top),
      ctaCenterPct: rc ? +(((rc.top + rc.bottom) / 2 / H) * 100).toFixed(1) : null,
      socialBottom: round(rs?.bottom),
      footerTop: round(rf?.top),
      voidAfterSocial: round(rs && rf ? rf.top - rs.bottom : null),
    };
  });
  console.log(route, JSON.stringify(m, null, 1));
  await page.close();
}
await browser.close();
