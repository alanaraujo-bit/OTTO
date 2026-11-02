import assert from 'node:assert/strict';
import { rhythmFor as rhythmWith } from '../src/domain/rhythm.ts';
import { NO_DEFERRALS } from '../src/domain/deferral.ts';

/*
 * The rhythm: what OTTO says first, and when. Every case pins one promise the notifications make,
 * because a reminder that fires on the wrong day, or keeps asking after the bill was paid, is worse
 * than none.
 */

const rhythm = (accounts, entries, series, today) => rhythmWith(accounts, entries, series, today, NO_DEFERRALS);

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

const acc = [{ id: 'a', name: 'CC', kind: 'checking', openingCents: 0 }];

const monthly = (over) => ({
  id: 's',
  kind: 'outflow',
  title: 'Aluguel',
  category: 'Moradia',
  accountId: 'a',
  amountCents: 100000,
  direction: 'out',
  dayOfMonth: 10,
  startDate: '2026-01-01',
  endDate: null,
  totalCount: null,
  paidCount: 0,
  counterparty: null,
  linkedShareToken: null,
  ...over,
});

const entry = (over) => ({
  id: '1',
  seriesId: null,
  settlesDate: null,
  date: '2026-09-01',
  amountCents: 1000,
  direction: 'out',
  title: 'x',
  category: 'Mercado',
  accountId: 'a',
  ...over,
});

const opening = (cents, date = '2026-08-31') => entry({ id: 'open', date, amountCents: cents, direction: 'in' });
const kind = (list, k) => list.filter((a) => a.kind === k);

check('a vespera de uma conta avisa as 18h com o saldo que sobra', () => {
  const list = rhythm(acc, [opening(500000)], [monthly({})], '2026-09-01');
  const [due] = kind(list, 'due').filter((a) => a.id === 'due:2026-09-10');
  assert.ok(due, 'the rent on the 10th has an eve');
  assert.equal(due.date, '2026-09-09');
  assert.equal(due.hour, 18);
  assert.ok(due.title.includes('Aluguel'));
  assert.ok(due.body.includes('4.000'), 'names where the balance lands: 5000 - 1000');
});

check('duas contas no mesmo dia viram uma mensagem so', () => {
  const series = [monthly({ id: 'rent' }), monthly({ id: 'net', title: 'Internet', amountCents: 10000 })];
  const eves = kind(rhythm(acc, [opening(500000)], series, '2026-09-01'), 'due').filter((a) => a.id === 'due:2026-09-10');
  assert.equal(eves.length, 1);
  assert.ok(eves[0].title.includes('2 contas'));
  assert.ok(eves[0].body.includes('Aluguel') && eves[0].body.includes('Internet'));
});

check('o dia de receber avisa de manha', () => {
  const salary = monthly({ id: 'sal', kind: 'inflow', direction: 'in', title: 'Salário', amountCents: 300000, dayOfMonth: 5 });
  const [inc] = kind(rhythm(acc, [opening(100000)], [salary], '2026-09-01'), 'income');
  assert.ok(inc);
  assert.equal(inc.date, '2026-09-05');
  assert.equal(inc.hour, 9);
  assert.ok(inc.body.includes('3.000'));
});

check('conta vencida pergunta na manha seguinte, e para quando e lancada', () => {
  const rent = monthly({ id: 'rent', dayOfMonth: 10 });
  const late = kind(rhythm(acc, [opening(500000)], [rent], '2026-09-12'), 'overdue');
  assert.equal(late.length, 1, 'the rent of the 10th was not recorded');
  assert.equal(late[0].date, '2026-09-13');
  assert.equal(late[0].params.id, 'rent');

  const paid = entry({ id: 'p', seriesId: 'rent', settlesDate: '2026-09-10', date: '2026-09-11', amountCents: 100000 });
  assert.equal(kind(rhythm(acc, [opening(500000), paid], [rent], '2026-09-12'), 'overdue').length, 0, 'paying it ends the asking');

  assert.equal(kind(rhythm(acc, [opening(500000)], [rent], '2026-09-17'), 'overdue').length, 0, 'after five days it is the past');
});

check('toda segunda tem o resumo da semana, inclusive quando esta tudo bem', () => {
  const list = rhythm(acc, [opening(500000)], [monthly({})], '2026-09-01');
  const weeks = kind(list, 'week');
  assert.ok(weeks.length >= 2, 'three weeks ahead hold at least two Mondays');
  for (const w of weeks) assert.equal(new Date(`${w.date}T12:00:00`).getDay(), 1, 'always a Monday');
  assert.ok(weeks.every((w) => w.title === 'Semana tranquila'), 'a comfortable month says so');
});

check('a semana que fica negativa e chamada de atencao, e nomeia o dia', () => {
  const list = rhythm(acc, [opening(50000)], [monthly({ dayOfMonth: 9 })], '2026-09-01');
  const w = kind(list, 'week').find((a) => a.date === '2026-09-07');
  assert.ok(w);
  assert.equal(w.title, 'Semana de atenção');
  assert.ok(w.body.includes('quarta'), 'the 9th of September 2026 is a Wednesday');
});

check('o ultimo dia diz como o mes fecha, o dia 1 diz como comeca', () => {
  const list = rhythm(acc, [opening(500000)], [monthly({})], '2026-09-20');
  const close = kind(list, 'monthClose')[0];
  assert.ok(close);
  assert.equal(close.date, '2026-09-30');
  assert.equal(close.hour, 20);
  const open = kind(list, 'monthOpen')[0];
  assert.ok(open);
  assert.equal(open.date, '2026-10-01');
  assert.ok(open.title.startsWith('Outubro'));

  assert.equal(kind(rhythm(acc, [opening(500000)], [monthly({})], '2026-09-01'), 'monthClose').length, 0, 'beyond three weeks, not yet');
});

check('mes que fecha no vermelho diz quanto falta entrar, uma vez', () => {
  const [s] = kind(rhythm(acc, [opening(50000)], [monthly({ dayOfMonth: 20 })], '2026-09-05'), 'shortfall');
  assert.ok(s);
  assert.equal(s.once, true, 'said once a month, not every morning the app is opened');
  assert.equal(s.date, '2026-09-06');
  assert.ok(s.body.includes('500'), 'needs R$ 500 to close at zero');
  assert.equal(kind(rhythm(acc, [opening(500000)], [monthly({})], '2026-09-05'), 'shortfall').length, 0);
});

check('tres dias quietos trazem um lembrete de lancar', () => {
  const [n] = kind(rhythm(acc, [opening(500000, '2026-09-01')], [], '2026-09-02'), 'nudge');
  assert.equal(n.date, '2026-09-04', 'three days after the last thing recorded');
  assert.equal(n.hour, 20);
  const [later] = kind(rhythm(acc, [opening(500000, '2026-09-01')], [], '2026-09-10'), 'nudge');
  assert.equal(later.date, '2026-09-11', 'never in the past');
});

check('nada e agendado para antes de hoje nem alem de tres semanas', () => {
  const list = rhythm(acc, [opening(500000)], [monthly({ dayOfMonth: 2 }), monthly({ id: 'b', dayOfMonth: 28 })], '2026-09-05');
  assert.ok(list.length > 0);
  for (const a of list) {
    assert.ok(a.date >= '2026-09-05', `${a.id} is not in the past`);
    assert.ok(a.date <= '2026-09-26', `${a.id} is inside the window`);
  }
  assert.equal(new Set(list.map((a) => a.id)).size, list.length, 'ids are unique, so rescheduling replaces');
});

console.log(`\n${pass} checks do ritmo passaram.`);
