// Home with the month plot's SVGs hidden: a clean plate so the real curve can be revealed in AE.
import { open, settle } from './shoot.mjs';
const { browser, page } = await open();
await page.goto('http://localhost:8098/home'); await settle(page, 3000);
const hidden = await page.evaluate(() => {
  const out = [];
  for (const s of document.querySelectorAll('svg')) {
    const r = s.getBoundingClientRect();
    if (r.width > 300 && r.top > 150 && r.top < 300 && r.height < 400) { s.style.visibility = 'hidden'; out.push([r.left, r.top, r.width, r.height].map(Math.round)); }
  }
  return out;
});
console.log('hidden svgs (css px):', JSON.stringify(hidden));
await page.waitForTimeout(300);
await page.screenshot({ path: '../assets/ui/home_plate.png' });
await browser.close();
