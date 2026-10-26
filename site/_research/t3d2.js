async page => {
  const pre = 'd2';
  await page.goto('http://localhost:5180/?' + Date.now());
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-r-hero-a.png` });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-r-hero-b.png` });
  const shots = [["#scrub-hero", .35], ["#scrub-hero", .6], ["#scrub-hero", 1], ['#antes', -1], ['#tela', -2], ['#scrub-as', .05], ['#scrub-as', .3], ['#scrub-as', .55], ['#scrub-as', .97], ['#registrar', -2], ['#categorias', -2], ['#divida', -2], ['#recursos', -1], ['#baixar', -1], ['#baixar', -3]];
  let i = 0;
  for (const [sel, p] of shots) {
    await page.evaluate(([sel, p]) => {
      const el = document.querySelector(sel);
      const top = el.getBoundingClientRect().top + scrollY;
      let y;
      if (p >= 0) y = top + p * (el.offsetHeight - innerHeight);
      else if (p === -1) y = top - 20;
      else if (p === -2) y = top + 120;
      else y = top + el.offsetHeight - innerHeight;
      window.scrollTo(0, y);
    }, [sel, p]);
    await page.waitForTimeout(p === -2 ? 3600 : 1000);
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-r-${String(i).padStart(2, '0')}.png` });
    i++;
  }
  const m = await page.evaluate(() => ({ H: document.documentElement.scrollHeight, vh: innerHeight, sw: document.documentElement.scrollWidth }));
  return m;
}
