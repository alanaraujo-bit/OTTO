async page => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5180/?p' + Date.now());
  await page.waitForTimeout(4000);
  const idle = await page.evaluate(() => new Promise((res) => {
    let n = 0; const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { n++; return orig(cb); };
    setTimeout(() => { window.requestAnimationFrame = orig; res(n); }, 3000);
  }));
  const cls = await page.evaluate(() => new Promise((res) => {
    let v = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true });
    const el = document.querySelector('#scrub-as');
    const top = el.getBoundingClientRect().top + scrollY;
    let y = top; const end = top + el.offsetHeight;
    const step = () => { y += 120; scrollTo(0, y); if (y < end) setTimeout(step, 60); else setTimeout(() => res(v), 400); };
    step();
  }));
  return { rafCallsIn3sIdle: idle, clsWhileScrollingAssistant: cls };
}
