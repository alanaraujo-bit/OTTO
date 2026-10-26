async page => {
  const pre = 'm';
  await page.reload(); await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(3800);
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  let i = 0;
  for (let y = 0; y < H - 10; y += Math.round(vh * 0.85)) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await page.waitForTimeout(950);
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/self/${pre}-${String(i).padStart(2,'0')}.png` });
    i++;
  }
  return { i, H };
}
