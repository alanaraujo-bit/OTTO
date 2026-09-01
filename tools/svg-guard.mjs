/**
 * Guards SVG colour props against a native/web divergence that web verification cannot see.
 *
 * react-native-svg's extractGradient does:
 *     const alpha = Math.round(extractOpacity(stopOpacity) * 255);
 *     stops.push([offset, color & 0x00ffffff | alpha << 24]);
 *
 * `color & 0x00ffffff` discards the colour's own alpha byte entirely — transparency comes ONLY from
 * `stopOpacity`, and `extractOpacity(undefined)` returns 1. So `stopColor="rgba(r,g,b,0.05)"` with no
 * `stopOpacity` renders FULLY OPAQUE on device while a browser honours the alpha.
 *
 * That shipped once: a near-white rim gradient painted the whole screen opaque on the handset and
 * every ink-coloured element vanished. The web screenshots looked perfect.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOTS = ['src', 'app'];

/** Props whose alpha channel react-native-svg ignores in favour of a separate opacity prop. */
const ALPHA_IGNORING = ['stopColor', 'fill', 'stroke'];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (['.ts', '.tsx'].includes(extname(entry.name))) yield full;
  }
}

const findings = [];

for (const root of ROOTS) {
  for await (const file of walk(root)) {
    const src = await readFile(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      const code = line.trim();
      // Prose about this very rule lives in comments; only real code is a defect.
      if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return;
      if (!line.includes('rgba(')) return;
      for (const prop of ALPHA_IGNORING) {
        // The prop and an rgba() literal on the same line is the shape that breaks.
        if (line.includes(prop) && !line.includes(`${prop}Opacity`)) {
          findings.push({ file, line: i + 1, prop, text: line.trim().slice(0, 90) });
        }
      }
    });
  }
}

if (findings.length) {
  console.error('Alpha in an SVG colour prop is dropped on Android. Use a solid colour plus the');
  console.error('matching opacity prop (stopOpacity / fillOpacity / strokeOpacity).\n');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.prop}  ${f.text}`);
  process.exit(1);
}
console.log('No alpha-bearing colours in SVG props that ignore alpha.');
