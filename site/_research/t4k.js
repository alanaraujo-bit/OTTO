async page => {
  const pre = 'k';
  await page.goto('http://localhost:5180/?' + Date.now());
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-h-0.png` });
  const out = {};
  const plot = await page.evaluate(() => { const r = document.querySelector('.hc-plot').getBoundingClientRect(); return r.height; });
  out.plotH = plot;
  for (const [i, p] of [[1, .35], [2, .6], [3, 1]]) {
    await page.evaluate((p) => { const el = document.querySelector('#scrub-hero'); const top = el.getBoundingClientRect().top + scrollY; scrollTo(0, top + p * (el.offsetHeight - innerHeight)); }, p);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-h-${i}.png` });
  }
  out.dip = await page.evaluate(() => { const z = document.querySelector('.hc-zero').getBoundingClientRect().top; const h = document.querySelector('#hc-head').getBoundingClientRect().top; return Math.round(h - z); });
  return out;
}
