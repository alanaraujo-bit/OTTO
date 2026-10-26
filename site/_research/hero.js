async page => {
  await page.goto('https://otto-site-one.vercel.app/?v=3');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'D:/PROJETOS/OTTO/site/_research/final/desktop-1440-00.png' });
  return await page.evaluate(() => document.querySelector('#hero-callouts').classList.contains('on'));
}
