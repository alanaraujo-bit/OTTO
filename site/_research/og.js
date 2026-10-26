async page => {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto('http://localhost:5180/_research/og.html?2');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'D:/PROJETOS/OTTO/site/assets/og.png' });
  return 'ok';
}
