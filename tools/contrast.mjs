/** WCAG contrast for the palette against the app ground. Body/placeholder must clear 4.5:1. */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const BG = '#08090B';
const checks = {
  ink: '#F2F4F7',
  inkMuted: '#9BA1AC',
  inkFaint: '#737B88',
  positive: '#3FBF74',
  negative: '#E5484D',
  warning: '#E2A03F',
};

let fail = 0;
for (const [name, value] of Object.entries(checks)) {
  const r = ratio(value, BG);
  const ok = r >= 4.5;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} ${value}  ${r.toFixed(2)}:1`);
}
console.log(`\nonInk on ink: ${ratio('#08090B', '#F2F4F7').toFixed(2)}:1`);
process.exit(fail ? 1 : 0);
