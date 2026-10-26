async page => {
  await page.goto('http://localhost:5180/');
  await page.waitForTimeout(1500);
  const out = [];
  for (const sel of ['#topo', '#scrub-mes', '#scrub-otto', '#scrub-cat']) {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView(), sel);
    await page.waitForTimeout(500);
    const name = sel.replace('#', '');
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/rm-${name}.png` });
    out.push(name);
  }
  out.push(await page.evaluate(() => document.documentElement.scrollHeight));
  return out;
}
