async page => {
  const cdp = await page.context().newCDPSession(page);
  await page.goto('http://localhost:5180/?perf' + Date.now());
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(3500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const r = await page.evaluate(() => new Promise((res) => {
    const longs = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
    const el = document.querySelector('#scrub-hero');
    const end = el.offsetHeight - innerHeight + 40;
    let y = 0, last = performance.now(), dropped = 0, frames = 0;
    const tick = (t) => { const dt = t - last; last = t; frames++; if (dt > 34) dropped += Math.round(dt / 16.7) - 1; if (y < end) { y += 14; scrollTo(0, y); requestAnimationFrame(tick); } else res({ frames, dropped, longs }); };
    requestAnimationFrame(tick);
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return r;
}
