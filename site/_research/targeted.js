async page => {
  const pre = 'PFX';
  await page.reload();
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-t-hero.png` });
  const shots = [['#scrub-mes', .05], ['#scrub-mes', .5], ['#scrub-mes', .74], ['#scrub-mes', .95], ['#scrub-otto', .1], ['#scrub-otto', .3], ['#scrub-otto', .97], ['#registrar', -1], ['#scrub-cat', .3], ['#scrub-cat', .95], ['#divida', -1]];
  let i = 0;
  for (const [sel, p] of shots) {
    await page.evaluate(([sel, p]) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      const y = p < 0 ? top + 20 : top + p * (el.offsetHeight - innerHeight);
      window.scrollTo(0, y);
    }, [sel, p]);
    await page.waitForTimeout(p < 0 ? 4200 : 900);
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-t-${String(i).padStart(2, '0')}.png` });
    i++;
  }
  return i;
}
