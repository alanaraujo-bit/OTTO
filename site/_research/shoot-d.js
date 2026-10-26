async page => {
  const prefix = "d";
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => innerHeight);
  let i = 0;
  for (let y = 0; y < H; y += Math.round(vh*0.9)) {
    await page.mouse.wheel(0, 0);
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `D:/PROJETOS/OTTO/site/_research/shots/giga-${prefix}-${String(i).padStart(2,'0')}.png` });
    i++;
  }
  return i;
}
