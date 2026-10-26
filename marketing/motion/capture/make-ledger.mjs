// Builds the demo ledger from the app's own sampleMonth (same data the "dados de exemplo" button seeds).
import { sampleMonth } from '../../../src/domain/sampleMonth.ts';
import fs from 'node:fs';
const today = new Date(process.argv[2] || Date.now());
const l = { ...sampleMonth(today), caps: [], categories: [], deferrals: [] };
fs.writeFileSync(new URL('./ledger.json', import.meta.url), JSON.stringify(l, null, 1));
console.log('accounts', l.accounts.length, 'series', l.series.length, 'entries', l.entries.length);
