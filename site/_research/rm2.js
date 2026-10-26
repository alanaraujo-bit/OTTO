async page => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5180/?rm' + Date.now());
  await page.waitForTimeout(1500);
  let i = 0;
  for (const sel of ['#topo', '#tela', '#assistente', '#scrub-as', '#registrar', '#categorias', '#divida']) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView(), sel);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/final-r1/reduced-motion-1440-${String(i++).padStart(2, '0')}.png` });
  }
  const m = await page.evaluate(() => ({ H: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return m;
}
