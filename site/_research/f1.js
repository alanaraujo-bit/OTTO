async page => {
  const pre = 'desktop-1440';
  await page.goto('https://otto-site-one.vercel.app/');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(4500);
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  let i = 0;
  for (let y = 0; y < H - 10; y += Math.round(vh * 0.85)) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/final/${pre}-${String(i).padStart(2,'0')}.png` });
    i++;
  }
  return { i, H, vh, sw };
}
