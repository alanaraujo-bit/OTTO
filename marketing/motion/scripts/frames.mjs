// Renders given frames of the main comp with comp.saveFrameToPng and tiles them into a contact sheet.
// Usage: node frames.mjs <sheetName> <frame> [frame...]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runJsx } from '../tools/ae-mcp/ae-bridge.mjs';
const [name, ...frames] = process.argv.slice(2);
const dir = 'D:/PROJETOS/OTTO/marketing/motion/previews/frames';
fs.mkdirSync(dir, { recursive: true });
const files = frames.map((f) => `${dir}/${name}_${String(f).padStart(4, '0')}.png`);
const code = `var c; for (var i=1;i<=app.project.numItems;i++){ if (app.project.item(i).name==="OTTO_30s_9x16") c=app.project.item(i); }
var fr=${JSON.stringify(frames.map(Number))}, fs=${JSON.stringify(files)};
for (var k=0;k<fr.length;k++){ var f=new File(fs[k]); if (f.exists) f.remove(); c.saveFrameToPng(fr[k]/30, f); }
return fr.length;`;
const r = await runJsx(code, 900000);
if (!r.ok) { console.log(r); process.exit(1); }
for (let i = 0; i < 300 && !files.every((f) => fs.existsSync(f)); i++) await new Promise((s) => setTimeout(s, 500));
const inputs = files.flatMap((f) => ['-i', f]);
const cols = files.length;
const filt = files.map((_, i) => `[${i}]scale=360:-1,pad=iw+6:ih:0:0:gray[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + (cols > 1 ? `hstack=${cols}` : 'null');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filt, `D:/PROJETOS/OTTO/marketing/motion/previews/${name}.png`]);
console.log('sheet', `previews/${name}.png`);
