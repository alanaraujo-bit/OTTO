// Scripted capture of real OTTO flows for the commercial. Output: ../assets/ui/*.png (1236 px wide).
import fs from 'node:fs';
import path from 'node:path';
import { open, settle } from './shoot.mjs';

const OUT = path.resolve('../assets/ui');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8098';
const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);

async function session(opts) {
  const s = await open(opts);
  return s;
}
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name); };

// 1. Static screens at device size.
if (want('screens')) {
  const { browser, page } = await session();
  for (const [route, name] of [['/home', 'home'], ['/razao', 'razao'], ['/analise', 'analise'], ['/calendario', 'calendario'],
    ['/contas', 'contas'], ['/recorrencias', 'recorrencias'], ['/notificacoes', 'notificacoes'], ['/tetos', 'tetos'],
    ['/categorias', 'categorias'], ['/recorrencia?id=ser-7', 'divida_emprestimo'], ['/sign-in', 'signin']]) {
    await page.goto(BASE + route); await settle(page, 3000); await shot(page, name);
  }
  await browser.close();
}

// 2. Tall versions for scroll moves (tab bar sits at the bottom of the tall frame; cropped in AE).
if (want('tall')) {
  const { browser, page } = await session({ height: 2600 });
  for (const [route, name] of [['/razao', 'razao_tall'], ['/analise', 'analise_tall'], ['/recorrencias', 'recorrencias_tall'], ['/home', 'home_tall'], ['/contas', 'contas_tall']]) {
    await page.goto(BASE + route); await settle(page, 3000); await shot(page, name);
  }
  await browser.close();
}

// 3. Lançar: the real capture flow, key by key.
if (want('lancar')) {
  const { browser, page } = await session();
  await page.goto(BASE + '/lancar'); await settle(page, 2500);
  await shot(page, 'lancar_0');
  let i = 1;
  for (const k of ['4', '5', '9', '0']) {
    await page.getByLabel(k, { exact: true }).click(); await settle(page, 600);
    await shot(page, `lancar_${i++}`);
  }
  try {
    await page.getByLabel(/^Categoria/).first().click(); await settle(page, 1200);
    await shot(page, 'lancar_cat_sheet');
    await page.getByText('Mercado', { exact: true }).first().click(); await settle(page, 1200);
    await shot(page, 'lancar_cat');
  } catch (e) { console.error('category step:', e.message.split('\n')[0]); }
  try {
    await page.getByText(/^Lançar saída/).click(); await settle(page, 3000);
    await shot(page, 'lancar_done');
  } catch (e) { console.error('submit step:', e.message.split('\n')[0]); }
  await browser.close();
}

// 4. Otto: the assistant screen with a real suggested question typed in (not sent).
if (want('otto')) {
  const { browser, page } = await session();
  await page.goto(BASE + '/otto'); await settle(page, 2500);
  await shot(page, 'otto_0');
  const input = page.getByPlaceholder('Pergunte ao Otto');
  const q = 'Quanto posso gastar este mês?';
  await page.addStyleTag({ content: '*:focus,*:focus-visible{outline:none !important}' }); await input.click(); await settle(page, 500);
  for (let n = 1; n <= q.length; n++) {
    await input.fill(q.slice(0, n)); await page.clock.runFor(60).catch(() => {});
    await shot(page, `otto_type_${String(n).padStart(2, '0')}`);
  }
  await browser.close();
}
