/**
 * Checks for the decisions the forms make before anything is written: which categories a direction
 * offers first, how a typed figure becomes cents, and where "Adiar esta parcela" may send an
 * occurrence. Run on its own or as the tail of `npm run ledger`.
 *
 *   node --import ./tools/register-ts.mjs tools/forms-check.mjs
 */
import assert from 'node:assert/strict';
import { categoryOrderFor, centsFromTyped, typedFromCents, deferChoices, MAX_CENTS } from '../src/ui/choices.ts';
import { landsOn, deferralMap } from '../src/domain/deferral.ts';

let pass = 0;
const check = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n')[0]}`);
    process.exitCode = 1;
  }
};

const entry = (category, direction) => ({
  id: category + direction + Math.random(),
  seriesId: null,
  settlesDate: null,
  date: '2026-10-10',
  time: null,
  recordedAt: '2026-10-10T10:00:00.000Z',
  amountCents: 1000,
  direction,
  title: category,
  category,
  accountId: 'a',
});

// --- Categories listen to the direction --------------------------------------------------------
check('saída: o que já saiu vem primeiro, Renda e entradas vão para o fim', () => {
  const entries = [
    entry('Mercado', 'out'), entry('Mercado', 'out'), entry('Transporte', 'out'),
    entry('Venda', 'in'), entry('Venda', 'in'), entry('Venda', 'in'),
  ];
  const out = categoryOrderFor('out', entries, [], []);
  assert.deepEqual(out.slice(0, 2), ['Mercado', 'Transporte']);
  const renda = out.indexOf('Renda');
  const venda = out.indexOf('Venda');
  const moradia = out.indexOf('Moradia');
  assert.ok(moradia < renda && moradia < venda, 'nomes sem histórico antes dos da outra direção');
  assert.ok(renda >= out.length - 2 && venda >= out.length - 2, 'Renda e Venda no fim');
});

check('entrada: Venda e Renda primeiro, gastos no fim', () => {
  const entries = [entry('Mercado', 'out'), entry('Venda', 'in'), entry('Venda', 'in')];
  const inn = categoryOrderFor('in', entries, [], []);
  assert.deepEqual(inn.slice(0, 2), ['Venda', 'Renda']);
  assert.equal(inn[inn.length - 1], 'Mercado');
});

check('nada é escondido nem fundido: o mesmo vocabulário nas duas direções', () => {
  const entries = [entry('Cartão de Crédito', 'out'), entry('Venda', 'in'), entry('casa', 'out')];
  const a = categoryOrderFor('out', entries, [], []);
  const b = categoryOrderFor('in', entries, [], []);
  assert.deepEqual([...a].sort(), [...b].sort());
  assert.equal(new Set(a.map((n) => n.toLocaleLowerCase('pt-BR'))).size, a.length, 'sem duplicata por caixa');
  assert.ok(a.includes('Cartão de Crédito') && a.includes('Cartão'), 'quase-duplicatas continuam separadas');
});

check('categoria usada nas duas direções conta como desta direção', () => {
  const entries = [entry('Pix', 'in'), entry('Pix', 'out')];
  assert.equal(categoryOrderFor('out', entries, [], [])[0], 'Pix');
  assert.equal(categoryOrderFor('in', entries, [], [])[0], 'Pix');
});

// --- A typed figure reads like the keypad --------------------------------------------------------
check('dígitos entram pela direita como centavos', () => {
  assert.equal(centsFromTyped('8', ''), 8);
  assert.equal(centsFromTyped('0,088', '0,08'), 88);
  assert.equal(centsFromTyped('8,000', '8,00'), 8000);
  assert.equal(centsFromTyped('1.234,567', '1.234,56'), 1234567);
  assert.equal(typedFromCents(12345678), '123.456,78');
});

check('apagar volta um dígito, e apagar a partir do zero esvazia', () => {
  assert.equal(centsFromTyped('80,0', '80,00'), 800);
  assert.equal(centsFromTyped('0,0', '0,00'), null, 'do zero, apagar limpa o campo');
  assert.equal(centsFromTyped('', '0,05'), null);
  assert.equal(centsFromTyped('0,000', '0,00'), 0, 'digitar zero mantém um R$ 0,00 real');
});

check('o teto de R$ 999.999,99 segura uma tecla presa', () => {
  assert.equal(centsFromTyped('9'.repeat(14), '9'.repeat(13)), MAX_CENTS);
});

check('o que o campo mostra', () => {
  assert.equal(typedFromCents(null), '');
  assert.equal(typedFromCents(-500), '', 'negativo não aparece, e por isso não é reescrito');
  assert.equal(typedFromCents(0), '0,00');
  assert.equal(typedFromCents(5), '0,05');
  assert.equal(typedFromCents(80000), '800,00');
  for (const c of [0, 1, 99, 100, 2190, 123456, 99999999]) {
    const shown = typedFromCents(c);
    assert.equal(centsFromTyped(shown, shown), c, `ida e volta ${c}`);
  }
});

// --- Adiar: every choice is one the engine honours -------------------------------------------------
check('adiar uma parcela vencida conta a partir de hoje', () => {
  const c = deferChoices({ date: '2026-10-08', on: '2026-10-08' }, '2026-10-18');
  assert.deepEqual(c.map((x) => x.to), ['2026-10-25', '2026-11-01', '2026-11-17']);
  assert.equal(c[0].label, '25 de out');
});

check('adiar uma parcela futura conta a partir do dia dela', () => {
  const c = deferChoices({ date: '2026-10-20', on: '2026-10-20' }, '2026-10-18');
  assert.deepEqual(c.map((x) => x.to), ['2026-10-27', '2026-11-03', '2026-11-19']);
});

check('adiar de novo conta a partir de onde ela já está', () => {
  const c = deferChoices({ date: '2026-10-08', on: '2026-10-25' }, '2026-10-18');
  assert.deepEqual(c.map((x) => x.to), ['2026-11-01', '2026-11-08', '2026-11-24']);
});

check('toda escolha é honrada por landsOn (nunca no dia ou antes)', () => {
  for (const [date, on, today] of [
    ['2026-10-08', '2026-10-08', '2026-10-18'],
    ['2026-10-31', '2026-10-31', '2026-10-01'],
    ['2026-02-28', '2026-02-28', '2026-02-28'],
    ['2026-12-20', '2027-01-03', '2026-12-25'],
  ]) {
    for (const { to } of deferChoices({ date, on }, today)) {
      assert.ok(to > date && to > today, `${to} depois de ${date} e de hoje ${today}`);
      const map = deferralMap([{ seriesId: 's', month: date.slice(0, 7), to, recordedAt: '' }]);
      assert.equal(landsOn('s', date, map), to);
    }
  }
});

console.log(`\nforms: ${pass} checks passed.`);
