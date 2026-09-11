/**
 * Arithmetic checks for the projection engine.
 *
 * A wrong balance renders exactly as convincingly as a right one, so a screenshot can never verify
 * this layer. Node 24 strips the types directly; nothing here needs a bundler or a test framework.
 *
 *   node tools/ledger-check.mjs
 */
import assert from 'node:assert/strict';
import {
  occurrences,
  project as projectWith,
  balanceToday,
  monthCurve as monthCurveWith,
  spendByCategory,
  debtStatus,
  upcoming as upcomingWith,
  dayItems as dayItemsWith,
  dayKey,
  parseDay,
  ledgerTape as ledgerTapeWith,
  nextOpen as nextOpenWith,
  overdue,
} from '../src/domain/projection.ts';
import { settled, occurrenceKey, numbered, debtHistory } from '../src/domain/settlement.ts';
import { NO_DEFERRALS, deferralMap } from '../src/domain/deferral.ts';

/*
 * The engine takes the deferrals explicitly — deliberately, so that no caller can forget them and
 * quietly bill an occurrence on a day the owner moved it off.
 *
 * Almost every check below was written to describe the engine with nothing deferred, and that is
 * still exactly what it should describe. Saying so once here beats threading an empty map through
 * ninety call sites and burying what each check is actually about. The deferral checks at the end
 * call the `...With` functions directly and pass a real map.
 */
const project = (series, from, to, done) => projectWith(series, from, to, done, NO_DEFERRALS);
const monthCurve = (accounts, entries, series, today, anchor) =>
  monthCurveWith(accounts, entries, series, today, NO_DEFERRALS, anchor);
const upcoming = (series, entries, today, days) =>
  upcomingWith(series, entries, today, NO_DEFERRALS, days);
const dayItems = (entries, series, day, today) =>
  dayItemsWith(entries, series, day, today, NO_DEFERRALS);
const ledgerTape = (accounts, entries, series, today, from, to) =>
  ledgerTapeWith(accounts, entries, series, today, from, to, NO_DEFERRALS);
const nextOpen = (series, entries, today, months) =>
  nextOpenWith(series, entries, today, NO_DEFERRALS, months);
const alertsFor = (accounts, entries, series, today, caps) =>
  alertsForWith(accounts, entries, series, today, NO_DEFERRALS, caps);
const monthClose = (accounts, entries, series, today) =>
  monthCloseWith(accounts, entries, series, today, NO_DEFERRALS);
import {
  monthlySpend,
  median,
  spendPace,
  categoryPace,
} from '../src/domain/analysis.ts';
import { statementCycle, statementTotal, limitUse } from '../src/domain/card.ts';
import { commitments, commitmentFor } from '../src/domain/commitments.ts';
import { paymentSeries, isSpend } from '../src/domain/spend.ts';
import { alertsFor as alertsForWith, monthClose as monthCloseWith } from '../src/domain/alerts.ts';
import { capReading, capReadings } from '../src/domain/cap.ts';
import { startOfMonth, subMonths } from 'date-fns';
import {
  parts,
  brl,
  brlShort,
  brlDelta,
  parseMoneyDraft,
  draftCents,
  formatMoneyDraft,
  draftFromCents,
} from '../src/domain/money.ts';
import { sampleMonth } from '../src/domain/sampleMonth.ts';

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

const acc = [
  { id: 'a', name: 'CC', kind: 'checking', openingCents: 0 },
  { id: 'c', name: 'Card', kind: 'card', openingCents: 999999 },
];

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

check('money splits sign, symbol, magnitude and cents', () => {
  assert.deepEqual(parts(481235), { sign: '', symbol: 'R$', whole: '4.812', cents: '35' });
  assert.deepEqual(parts(-5), { sign: '−', symbol: 'R$', whole: '0', cents: '05' });
  assert.equal(parts(100000000).whole, '1.000.000');
  assert.equal(brl(-481235), '−R$ 4.812,35');
  assert.equal(brlShort(481299), 'R$ 4.813');
  assert.equal(brlDelta(1000), '+R$ 10,00');
});

check('a day-31 series still occurs in a 30-day month', () => {
  const o = occurrences(monthly({ dayOfMonth: 31 }), '2026-04-01', '2026-04-30');
  assert.equal(o.length, 1);
  assert.equal(o[0].date, '2026-04-30');
});

check('february clamps to the 28th', () => {
  const o = occurrences(monthly({ dayOfMonth: 31 }), '2026-02-01', '2026-02-28');
  assert.equal(o[0].date, '2026-02-28');
});

check('a series does not occur before it starts', () => {
  const o = occurrences(monthly({ startDate: '2026-06-01' }), '2026-01-01', '2026-12-31');
  assert.equal(o.length, 7);
  assert.equal(o[0].date, '2026-06-10');
});

check('a debt stops at its installment count', () => {
  const d = monthly({ kind: 'debt', totalCount: 3, paidCount: 0, startDate: '2026-01-01' });
  const o = occurrences(d, '2026-01-01', '2026-12-31');
  assert.equal(o.length, 3);
  assert.deepEqual(
    o.map((x) => x.installment.n),
    [1, 2, 3],
  );
});

check('uma divida quitada nao projeta nada — por liquidacao, nao por contador', () => {
  const d = monthly({ kind: 'debt', totalCount: 3, paidCount: 3, startDate: '2026-01-01' });

  // `occurrences` is the raw calendar expansion: a debt of three installments has three, and how
  // many of them are done is not a question it answers. That is deliberate — `paidCount` reaching
  // the total no longer suppresses the walk, because a deferred installment can leave the counter
  // full while one identity is still owed.
  assert.equal(occurrences(d, '2026-01-01', '2026-12-31').length, 3);

  // Settlement is what removes them, addressed by identity.
  const paid = [
    entry({ id: 'a', seriesId: 's', settlesDate: '2026-01-10', date: '2026-01-10' }),
    entry({ id: 'b', seriesId: 's', settlesDate: '2026-02-10', date: '2026-02-10' }),
    entry({ id: 'c', seriesId: 's', settlesDate: '2026-03-10', date: '2026-03-10' }),
  ];
  assert.equal(project([d], '2026-01-01', '2026-12-31', settled(paid)).length, 0);
});

check('a parcela nao paga sobrevive ao contador cheio', () => {
  /*
   * The trapdoor this replaced: defer parcela 7, pay all the others, and `paidCount` reaches the
   * total while identity 7 was never settled. The old early return made the series project nothing,
   * so the one installment still owed vanished from every screen.
   */
  const d = monthly({ kind: 'debt', totalCount: 3, paidCount: 3, startDate: '2026-01-01' });
  const allButTheFirst = [
    entry({ id: 'b', seriesId: 's', settlesDate: '2026-02-10', date: '2026-02-10' }),
    entry({ id: 'c', seriesId: 's', settlesDate: '2026-03-10', date: '2026-03-10' }),
  ];
  const open = project([d], '2026-01-01', '2026-12-31', settled(allButTheFirst));
  assert.equal(open.length, 1, 'a que nunca foi liquidada continua devida');
  assert.equal(open[0].date, '2026-01-10');
  assert.equal(open[0].installment.n, 1);
});

check('parcelas declaradas pagas caem antes do primeiro mes projetado', () => {
  /*
   * `paidCount` no longer suppresses anything, so installments the owner merely *declared* paid —
   * the ones with no entry behind them — are not filtered by `project`. What keeps them off every
   * screen is where they sit: `startDateFor` anchors the debt so that installment `paidCount + 1`
   * is the month it was created in, which puts every declared one strictly in the past. Since each
   * window in the app runs from the current month forward, none of them is ever reachable.
   */
  const created = '2026-09-15';
  const d = monthly({
    kind: 'debt',
    totalCount: 24,
    paidCount: 6,
    dayOfMonth: 8,
    // What `startDateFor` produces: six months back from the month of creation.
    startDate: '2026-03-01',
  });
  const fromThisMonth = occurrences(d, '2026-09-01', '2027-08-31');
  assert.equal(fromThisMonth[0].installment.n, 7, 'a janela abre exatamente na primeira nao paga');
  assert.ok(
    occurrences(d, '2026-01-01', '2026-08-31').every((o) => o.date < created),
    'as declaradas ficam todas atras da criacao',
  );
});

check('installment numbering survives a window that starts mid-series', () => {
  const d = monthly({ kind: 'debt', totalCount: 12, paidCount: 0, startDate: '2026-01-01' });
  const o = occurrences(d, '2026-05-01', '2026-05-31');
  assert.equal(o[0].installment.n, 5);
});

check('a credit line is never counted as money held', () => {
  const entries = [
    entry({ id: '1', amountCents: 50000, direction: 'in', category: 'Renda' }),
    entry({ id: '2', amountCents: 20000, direction: 'in', category: 'Renda', accountId: 'c' }),
  ];
  assert.equal(balanceToday(acc, entries, '2026-09-02'), 50000);
});

check('entries after today do not move the balance', () => {
  const entries = [entry({ date: '2026-09-20', amountCents: 50000, direction: 'in' })];
  assert.equal(balanceToday(acc, entries, '2026-09-02'), 0);
});

check('the curve is continuous through today and ends where the month closes', () => {
  const entries = [
    entry({ id: '1', date: '2026-09-01', amountCents: 300000, direction: 'in', category: 'Renda' }),
    entry({ id: '2', date: '2026-09-02', amountCents: 50000, direction: 'out' }),
  ];
  const c = monthCurve(acc, entries, [monthly({ dayOfMonth: 20 })], '2026-09-02');
  assert.equal(c.points.length, 30);
  assert.equal(c.todayIndex, 1);
  assert.equal(c.balanceNow, 250000, 'balance today');
  assert.equal(c.points[1].balance, c.balanceNow, 'the line passes through the hero number');
  assert.equal(c.balanceEnd, 150000, 'one projected bill of 1.000,00 lands on the 20th');
  assert.equal(c.points[0].balance, 300000, 'day one reconstructed from entries');
});

check('a bill already past is not projected on top of its own entry', () => {
  const s = monthly({ dayOfMonth: 1 });
  const entries = [
    entry({ seriesId: 's', date: '2026-09-01', amountCents: 100000, direction: 'out' }),
  ];
  const c = monthCurve(acc, entries, [s], '2026-09-02');
  assert.equal(c.balanceNow, -100000);
  assert.equal(c.balanceEnd, -100000, 'the 1st is past; it must be counted exactly once');
});

check('the trough only looks forward', () => {
  const entries = [
    entry({ id: '1', date: '2026-09-01', amountCents: 900000, direction: 'out' }),
    entry({ id: '2', date: '2026-09-02', amountCents: 900000, direction: 'in', category: 'Renda' }),
  ];
  const c = monthCurve(acc, entries, [], '2026-09-02');
  assert.equal(c.trough.day, 2, 'the dip on the 1st is already survived');
  assert.equal(c.trough.balance, 0);
});

check('inflow and outflow are both positive magnitudes', () => {
  const entries = [
    entry({ id: '1', date: '2026-09-01', amountCents: 300000, direction: 'in', category: 'Renda' }),
    entry({ id: '2', date: '2026-09-02', amountCents: 50000, direction: 'out' }),
  ];
  const c = monthCurve(acc, entries, [], '2026-09-02');
  assert.equal(c.inflow, 300000);
  assert.equal(c.outflow, 50000);
});

check('spend by category counts outflow only, inside the window', () => {
  const entries = [
    entry({ id: '1', date: '2026-09-01', amountCents: 1000 }),
    entry({ id: '2', date: '2026-09-02', amountCents: 3000 }),
    entry({ id: '3', date: '2026-09-02', amountCents: 9999, direction: 'in', category: 'Renda' }),
    entry({ id: '4', date: '2026-08-30', amountCents: 7777 }),
  ];
  assert.deepEqual(spendByCategory(entries, '2026-09-01', '2026-09-02', new Set()), [
    { category: 'Mercado', cents: 4000 },
  ]);
});

check('debt status reports what is left and when it ends', () => {
  const d = debtStatus([
    monthly({
      kind: 'debt',
      totalCount: 24,
      paidCount: 8,
      amountCents: 43000,
      startDate: '2026-01-01',
    }),
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].remainingCents, 16 * 43000);
  assert.equal(d[0].finishes.slice(0, 7), '2027-12', '24 installments from January 2026');
});

check('the negative-month sentence fires exactly when the month dips', () => {
  // The seeded month never goes below zero, so this state cannot be confirmed by looking at the
  // screen. It is confirmed here instead: a lean month must produce the trough the screen reports.
  const lean = [
    entry({ date: '2026-09-01', amountCents: 20000, direction: 'in', category: 'Renda' }),
  ];
  const c = monthCurve(acc, lean, [monthly({ dayOfMonth: 15, amountCents: 90000 })], '2026-09-02');
  assert.ok(c.trough.balance < 0, 'the dip has to be found');
  assert.equal(c.trough.day, 15, 'and reported on the day it happens');
  assert.equal(c.trough.balance, -70000);
});

check('project orders every series by date', () => {
  const all = [monthly({ id: 'a', dayOfMonth: 20 }), monthly({ id: 'b', dayOfMonth: 5 })];
  const o = project(all, '2026-09-01', '2026-09-30', new Set());
  assert.deepEqual(
    o.map((x) => x.date),
    ['2026-09-05', '2026-09-20'],
  );
});

/*
 * Month navigation.
 *
 * The screen can now be pointed at any month, which introduces one invariant that did not exist
 * before and cannot be seen on a screenshot: two adjacent months share a boundary, and they have to
 * agree about it. A month that closes at X and a next month that opens at anything but X is a
 * ledger that disagrees with itself, and the owner would only ever discover it by arithmetic.
 */

const NAV_TODAY = '2026-09-15';
const navEntries = [
  entry({ id: '1', date: '2026-08-05', amountCents: 400000, direction: 'in', category: 'Renda' }),
  entry({ id: '2', date: '2026-08-20', amountCents: 60000, direction: 'out' }),
  entry({ id: '3', date: '2026-09-05', amountCents: 400000, direction: 'in', category: 'Renda' }),
  entry({ id: '4', date: '2026-09-11', amountCents: 25000, direction: 'out' }),
];
const navSeries = [monthly({ dayOfMonth: 20, amountCents: 100000 })];
const at = (anchor) => monthCurve(acc, navEntries, navSeries, NAV_TODAY, anchor);

check('adjacent months agree about the boundary they share', () => {
  const jul = at('2026-07-04');
  const aug = at('2026-08-09');
  const sep = at('2026-09-15');
  const oct = at('2026-10-22');
  const nov = at('2026-11-30');

  assert.equal(aug.balanceStart, jul.balanceEnd, 'august opens where july closed');
  assert.equal(sep.balanceStart, aug.balanceEnd, 'september opens where august closed');
  assert.equal(oct.balanceStart, sep.balanceEnd, 'october opens where september closed');
  assert.equal(nov.balanceStart, oct.balanceEnd, 'november opens where october closed');
});

check('a month is labelled by where it sits relative to today', () => {
  assert.equal(at('2026-08-09').era, 'past');
  assert.equal(at('2026-09-15').era, 'current');
  assert.equal(at('2026-10-22').era, 'future');
});

check('only the current month has a today to point at', () => {
  assert.equal(at('2026-08-09').todayIndex, null);
  assert.equal(at('2026-10-22').todayIndex, null);
  assert.equal(at('2026-09-15').todayIndex, 14, 'the 15th is index 14');
  assert.equal(
    at('2026-09-15').points[14].balance,
    at('2026-09-15').balanceNow,
    'and the line still passes through the hero number',
  );
});

check('a closed month is entirely record and a future month entirely forecast', () => {
  const aug = at('2026-08-09');
  assert.ok(
    aug.points.every((p) => p.actual),
    'every day of a month that has ended has already happened',
  );
  assert.equal(aug.outflowDone, aug.outflow, 'nothing in a closed month is still forecast');
  assert.equal(aug.inflowDone, aug.inflow);

  const oct = at('2026-10-22');
  assert.ok(
    oct.points.every((p) => !p.actual),
    'no day of a month that has not started has happened',
  );
  assert.equal(oct.outflowDone, 0, 'nothing in a future month has been realised');
  assert.equal(oct.inflowDone, 0);
  assert.equal(oct.balanceNow, oct.balanceStart, 'there is no elapsed half to stand at');
});

check('the current month splits its flow into realised and still forecast', () => {
  const sep = at('2026-09-15');
  assert.equal(sep.inflowDone, 400000, 'the salary on the 5th has landed');
  assert.equal(sep.inflow, 400000, 'and nothing else comes in this month');
  assert.equal(sep.outflowDone, 25000, 'only the entry on the 11th has been paid');
  assert.equal(sep.outflow, 125000, 'the bill on the 20th is still ahead');
  assert.ok(sep.outflowDone < sep.outflow);
});

check('a past month is never overwritten by a projection', () => {
  // The series bills 1.000,00 on the 20th of every month, and August's was never recorded as an
  // entry. It must not be invented: August has one recorded outflow of 600,00 and no other.
  const aug = at('2026-08-09');
  assert.equal(aug.outflow, 60000, 'only what was actually recorded in August');
});

check('a future month is reached by projecting past the months between', () => {
  const sep = at('2026-09-15');
  const nov = at('2026-11-01');
  // September closes, then October bills once, so November opens one bill lower.
  assert.equal(nov.balanceStart, sep.balanceEnd - 100000);
});

check('the day slice reports record for a past day and forecast for a future one', () => {
  const past = dayItems(navEntries, navSeries, '2026-09-11', NAV_TODAY);
  assert.equal(past.length, 1);
  assert.equal(past[0].amountCents, 25000);
  assert.equal(past[0].settled, true, 'it happened');

  const future = dayItems(navEntries, navSeries, '2026-09-20', NAV_TODAY);
  assert.equal(future.length, 1);
  assert.equal(future[0].title, 'Aluguel');
  assert.equal(future[0].settled, false, 'it has not happened yet');

  assert.deepEqual(dayItems(navEntries, navSeries, '2026-09-13', NAV_TODAY), [], 'a quiet day');
});

check('the trough reads the whole of a month that has already closed', () => {
  // Forward-only would leave a closed month with no trough at all, since none of its days are ahead.
  const aug = at('2026-08-09');
  assert.ok(aug.trough, 'a closed month still reports its low point');
  assert.equal(aug.trough.date.slice(0, 7), '2026-08');
});

check('a fita do razao fecha com a curva do mes', () => {
  const t = new Date(2026, 8, 2);
  const iso = dayKey(t);
  const { accounts, series, entries } = sampleMonth(t);
  const curve = monthCurve(accounts, entries, series, iso);
  const tape = ledgerTape(accounts, entries, series, iso, curve.from, curve.to);

  // The one invariant that matters: two modules reading the same ledger over the same window must
  // not disagree about where it ends. If they ever do, one of the two screens is lying.
  assert.equal(tape[tape.length - 1].balance, curve.balanceEnd, 'tape ends where the curve ends');

  const last = tape.filter((d) => d.actual).pop();
  assert.equal(last.balance, curve.balanceNow, 'the tape passes through today at the hero figure');
});

check('a fita caminha: cada dia e o anterior mais o que se moveu', () => {
  const t = new Date(2026, 8, 2);
  const iso = dayKey(t);
  const { accounts, series, entries } = sampleMonth(t);
  const tape = ledgerTape(accounts, entries, series, iso, '2026-08-01', '2026-11-30');

  assert.ok(tape.length > 10, 'the window must actually produce a tape');
  for (let i = 1; i < tape.length; i++) {
    assert.equal(
      tape[i].balance,
      tape[i - 1].balance + tape[i].moved,
      'day ' + tape[i].date + ' does not follow from the one before it',
    );
    assert.ok(tape[i - 1].date < tape[i].date, 'days are ordered and never repeat');
    if (tape[i].date !== iso)
      assert.notEqual(tape[i].moved, 0, 'a quiet day other than today is not on the tape');
  }
});

check('hoje esta sempre na fita, tenha se movido ou nao', () => {
  const iso = '2026-09-02';
  // Built rather than seeded: the property is about the tape, and a generated ledger that happens to
  // be quiet today is a coincidence the seed is free to stop providing.
  const accounts = acc;
  const series = [];
  const entries = [entry({ id: 'y', date: '2026-09-01', amountCents: 3000 })];

  const tape = ledgerTape(accounts, entries, series, iso, '2026-08-01', '2026-11-30');
  const here = tape.find((d) => d.date === iso);
  assert.ok(here, 'the ledger must open on a row that exists');
  assert.equal(here.items.length, 0, 'a quiet today carries no items');
  assert.equal(here.moved, 0);
  assert.equal(here.balance, balanceToday(accounts, entries, iso), 'and still carries the balance');

  // Outside the window it is not invented.
  const past = ledgerTape(accounts, entries, series, iso, '2026-08-01', '2026-08-31');
  assert.ok(!past.some((d) => d.date === iso), 'today is not forced into a window it is outside of');
});

check('a fita nunca inventa um dia que ja passou, nem repete um que nao passou', () => {
  const iso = '2026-09-02';
  const { accounts, series, entries } = sampleMonth(new Date(2026, 8, 2));
  const tape = ledgerTape(accounts, entries, series, iso, '2026-08-01', '2026-11-30');

  for (const day of tape) {
    for (const item of day.items) {
      if (day.date <= iso) assert.ok(item.settled, 'projection laid over past day ' + day.date);
      else assert.ok(!item.settled, 'recorded entry on future day ' + day.date);
    }
  }
});

check('linha de credito nao entra na fita', () => {
  const iso = '2026-09-02';
  const series = [monthly({ id: 'card', accountId: 'c', dayOfMonth: 20, title: 'Fatura' })];
  const entries = [entry({ id: 'e1', accountId: 'c', date: '2026-09-01', amountCents: 5000 })];
  const tape = ledgerTape(acc, entries, series, iso, '2026-09-01', '2026-09-30');

  // Today is on the tape as the axis; what must be absent is any row a card put there.
  assert.equal(tape.flatMap((d) => d.items).length, 0, 'a card moves no money the balance sees');
  assert.equal(tape.every((d) => d.moved === 0), true);
});


check('o passo do mes fecha com o total do mes quando ele acaba', () => {
  const { entries } = sampleMonth(new Date(2026, 8, 2));

  // Read on the last day of a complete month: pace and full total describe the same window, so if
  // they can disagree one of the two readings on the screen is lying.
  const aug = monthlySpend(entries, [], '2026-08-31', 6).find((m) => m.month === '2026-08');
  assert.equal(aug.toDate, aug.cents, 'through day 31 of August is the whole of August');

  const jul = monthlySpend(entries, [], '2026-07-31', 6).find((m) => m.month === '2026-07');
  assert.equal(jul.toDate, jul.cents);
});

check('o dia de leitura e aparado ao tamanho de cada mes', () => {
  const entries = [
    entry({ id: 'f', date: '2026-02-28', amountCents: 5000 }),
    entry({ id: 'm', date: '2026-03-31', amountCents: 7000 }),
  ];

  // Read on the 31st. February has no 31st: without clamping, its window would end before its own
  // last day and it would come back looking like the thriftiest month of the owner's life.
  const feb = monthlySpend(entries, [], '2026-03-31', 2).find((m) => m.month === '2026-02');
  assert.equal(feb.toDate, 5000, 'day 31 in February is day 28');
  assert.equal(feb.toDate, feb.cents);
});

check('um mes que o razao nao viu inteiro nao entra na mediana', () => {
  const entries = [
    entry({ id: 'a', date: '2026-07-01', amountCents: 30000 }),
    entry({ id: 'b', date: '2026-08-10', amountCents: 30000 }),
    entry({ id: 'c', date: '2026-09-01', amountCents: 10000 }),
  ];

  const pace = spendPace(entries, [], '2026-09-15', 6);
  assert.deepEqual(
    pace.history.filter((m) => !m.covered).map((m) => m.month),
    ['2026-03', '2026-04', '2026-05', '2026-06'],
    'every month before the first entry',
  );

  // Only July and August are covered and complete. A median that had swallowed the four empty
  // months would read zero and announce a spectacular overspend against a past that never happened.
  assert.equal(pace.basis, 2);
  assert.equal(pace.usual, 30000);
  assert.equal(pace.delta, -20000);
});

check('o mes em que o razao comecou no meio e descartado', () => {
  // Identical to the case above except the ledger opens on the 10th of July rather than the 1st.
  // Those first nine days are unknowable — nothing tells "spent nothing" from "was not recording" —
  // so July stops being comparable and the basis drops to August alone.
  const entries = [
    entry({ id: 'a', date: '2026-07-10', amountCents: 30000 }),
    entry({ id: 'b', date: '2026-08-10', amountCents: 30000 }),
    entry({ id: 'c', date: '2026-09-01', amountCents: 10000 }),
  ];

  const pace = spendPace(entries, [], '2026-09-15', 6);
  assert.equal(pace.basis, 1);
  assert.equal(pace.usual, null, 'one month is not a normal');
  assert.equal(pace.delta, null);
});

check('sem meses suficientes a analise nao inventa um normal', () => {
  const entries = [
    entry({ id: 'a', date: '2026-08-01', amountCents: 30000 }),
    entry({ id: 'b', date: '2026-09-01', amountCents: 10000 }),
  ];

  const pace = spendPace(entries, [], '2026-09-15', 6);
  assert.equal(pace.basis, 1, 'exactly one comparable month');
  assert.equal(pace.usual, null);
  assert.equal(pace.delta, null);
  assert.equal(pace.spent, 10000, 'the reading itself is still true');

  for (const c of categoryPace(entries, [], '2026-09-15', 6)) {
    assert.equal(c.usual, null, 'no category gets a median either');
    assert.equal(c.delta, null);
  }
});

check('entrada nao e gasto, e a mediana e do mesmo trecho do mes', () => {
  const entries = [
    entry({ id: 'i1', date: '2026-07-05', amountCents: 999999, direction: 'in' }),
    entry({ id: 'a', date: '2026-07-01', amountCents: 10000 }),
    entry({ id: 'b', date: '2026-07-20', amountCents: 90000 }),
    entry({ id: 'c', date: '2026-08-03', amountCents: 20000 }),
    entry({ id: 'd', date: '2026-08-20', amountCents: 90000 }),
    entry({ id: 'e', date: '2026-09-03', amountCents: 50000 }),
  ];

  // Read on the 5th: every 20th falls outside the window, and salary is never spend.
  const pace = spendPace(entries, [], '2026-09-05', 6);
  assert.equal(pace.usual, 15000, 'median of 10000 and 20000 through day 5');
  assert.equal(pace.spent, 50000);
  assert.equal(pace.delta, 35000);
});

check('uma categoria que sumiu aparece como queda, nao some da lista', () => {
  const entries = [
    entry({ id: 'a', date: '2026-07-01', amountCents: 40000, category: 'Lazer' }),
    entry({ id: 'b', date: '2026-08-02', amountCents: 40000, category: 'Lazer' }),
    entry({ id: 'c', date: '2026-09-02', amountCents: 10000, category: 'Mercado' }),
  ];

  const rows = categoryPace(entries, [], '2026-09-10', 6);
  const lazer = rows.find((r) => r.category === 'Lazer');
  assert.ok(lazer, 'a category the owner stopped spending on is still a fact about this month');
  assert.equal(lazer.cents, 0);
  assert.equal(lazer.usual, 40000);
  assert.equal(lazer.delta, -40000);
});

const card = (over) => ({
  id: 'card',
  name: 'Nubank',
  kind: 'card',
  openingCents: 0,
  closingDay: 28,
  dueDay: 10,
  limitCents: 800000,
  ...over,
});

check('o vencimento cai no mes seguinte quando o dia e menor que o do fechamento', () => {
  // The ordinary Brazilian card: closes on the 28th, due on the 10th — of the month after. Treating
  // this as an edge case would get the common card wrong.
  const s = statementCycle(card(), '2026-09-20');
  assert.equal(s.closes, '2026-09-28');
  assert.equal(s.due, '2026-10-10');
  assert.equal(s.closed, false, 'still open on the 20th');
  assert.equal(s.from, '2026-08-29', 'the day after the previous close');
  assert.equal(s.to, '2026-09-28');
  assert.equal(s.daysToClose, 8);
  assert.equal(s.daysToDue, 20);
});

check('depois de fechar, a fatura corrente e a que espera pagamento', () => {
  const s = statementCycle(card(), '2026-10-01');
  assert.equal(s.closes, '2026-09-28', 'the statement that closed, not the one now accruing');
  assert.equal(s.due, '2026-10-10');
  assert.equal(s.closed, true);
  assert.equal(s.daysToClose, -3);
  assert.equal(s.daysToDue, 9);
});

check('no proprio dia do vencimento a fatura ainda e a corrente', () => {
  const s = statementCycle(card(), '2026-10-10');
  assert.equal(s.due, '2026-10-10', 'a bill due today has not gone away');
  assert.equal(s.daysToDue, 0);

  // And the day after, the reading has moved on to the next one.
  const next = statementCycle(card(), '2026-10-11');
  assert.equal(next.due, '2026-11-10');
  assert.equal(next.closes, '2026-10-28');
});

check('vencimento depois do fechamento fica no mesmo mes', () => {
  const s = statementCycle(card({ closingDay: 3, dueDay: 15 }), '2026-09-01');
  assert.equal(s.closes, '2026-09-03');
  assert.equal(s.due, '2026-09-15', 'due day is strictly after the close, so it is the same month');
  assert.equal(s.from, '2026-08-04');
});

check('o vencimento e sempre depois do fechamento, para qualquer par de dias', () => {
  // The general form of the same-day case: a statement may never fall due the instant it closes,
  // and the window it covers may never be empty or inverted. Swept rather than spot-checked,
  // because the two days are owner input and every combination of them is reachable.
  for (let closingDay = 1; closingDay <= 31; closingDay++) {
    for (const dueDay of [1, 5, 10, 15, 28, 31]) {
      for (const today of ['2026-01-15', '2026-02-27', '2026-02-28', '2026-09-05', '2026-12-31']) {
        const s = statementCycle(card({ closingDay, dueDay }), today);
        assert.ok(s, 'a configured card always has a current statement');
        assert.ok(s.due > s.closes, closingDay + '/' + dueDay + ' due ' + s.due + ' closes ' + s.closes);
        assert.ok(s.due >= today, 'the current statement is the next one to fall due');
        assert.ok(s.from <= s.to, 'the purchase window is never inverted');
        assert.equal(s.closed, today > s.closes);
      }
    }
  }
});

check('entre o fechamento e o vencimento a corrente e a que ja fechou', () => {
  // Closing and falling due on the same number: on the 5th the next bill to arrive is the one that
  // closed on the 10th of last month and is due on the 10th of this one.
  const s = statementCycle(card({ closingDay: 10, dueDay: 10 }), '2026-09-05');
  assert.equal(s.closes, '2026-08-10');
  assert.equal(s.due, '2026-09-10');
  assert.equal(s.closed, true);

  // One day after that due date the reading moves on to the statement now accruing.
  const next = statementCycle(card({ closingDay: 10, dueDay: 10 }), '2026-09-11');
  assert.equal(next.closes, '2026-09-10');
  assert.equal(next.due, '2026-10-10');
});
check('o ciclo e aparado ao tamanho do mes', () => {
  // A card that closes on the 31st still closes in February.
  const s = statementCycle(card({ closingDay: 31, dueDay: 12 }), '2026-02-15');
  assert.equal(s.closes, '2026-02-28');
  assert.equal(s.due, '2026-03-12');
  assert.equal(s.from, '2026-02-01', 'the day after January the 31st');
});

check('sem ciclo configurado nada e inventado', () => {
  assert.equal(statementCycle(card({ closingDay: null }), '2026-09-20'), null);
  assert.equal(statementCycle(card({ dueDay: null }), '2026-09-20'), null);
  assert.equal(statementCycle({ ...card(), kind: 'checking' }, '2026-09-20'), null);
});

check('a fatura conta so o que foi lancado no cartao dentro da janela', () => {
  const c = card();
  const s = statementCycle(c, '2026-09-20');
  const entries = [
    entry({ id: 'in', date: '2026-09-02', amountCents: 5000, accountId: 'card' }),
    entry({ id: 'edge-a', date: '2026-08-29', amountCents: 1000, accountId: 'card' }),
    entry({ id: 'edge-b', date: '2026-09-28', amountCents: 2000, accountId: 'card' }),
    entry({ id: 'before', date: '2026-08-28', amountCents: 9900, accountId: 'card' }),
    entry({ id: 'after', date: '2026-09-29', amountCents: 9900, accountId: 'card' }),
    entry({ id: 'other', date: '2026-09-02', amountCents: 9900, accountId: 'a' }),
    entry({ id: 'refund', date: '2026-09-02', amountCents: 9900, accountId: 'card', direction: 'in' }),
  ];

  // Both window edges are in, everything outside is out, and the refund is netted rather than
  // dropped: 1000 + 5000 + 2000 - 9900.
  assert.equal(statementTotal(entries, c, s), -1900, 'window edges in, refund netted');
});

check('uso do limite nao e travado no cheio', () => {
  const c = card({ limitCents: 100000 });
  assert.equal(limitUse(50000, c), 0.5);
  // A card over its line is the one case where the figure matters most; clamping would hide it.
  assert.equal(limitUse(130000, c), 1.3);
  assert.equal(limitUse(1000, card({ limitCents: null })), null);
  assert.equal(limitUse(1000, card({ limitCents: 0 })), null);
});

check('o ano de uma recorrencia sem fim e exatamente doze vezes a parcela', () => {
  // The invariant that catches the off-by-one. Anchoring the window on `today` instead of on the
  // month would give 13 occurrences for a series whose day has not come round yet and 11 for one
  // whose has — the same subscription reporting two different yearly costs depending on the date it
  // was looked at.
  for (const on of [1, 5, 15, 28, 31]) {
    for (const today of ['2026-01-01', '2026-02-15', '2026-09-30', '2026-12-31']) {
      const c = commitmentFor(monthly({ dayOfMonth: on, amountCents: 2190 }), today);
      assert.equal(c.count, 12, 'day ' + on + ' read on ' + today);
      assert.equal(c.yearCents, 12 * 2190);
      assert.equal(c.monthlyCents, 2190);
      assert.equal(c.remaining, null);
    }
  }
});

check('uma assinatura que acaba no meio do ano custa so ate la', () => {
  const c = commitmentFor(
    monthly({ dayOfMonth: 10, amountCents: 5000, endDate: '2026-03-31' }),
    '2026-01-05',
  );
  assert.equal(c.count, 3, 'January, February and March');
  assert.equal(c.yearCents, 15000);
});

check('uma divida custa o que falta dela, nao doze parcelas', () => {
  const c = commitmentFor(
    monthly({
      kind: 'debt',
      dayOfMonth: 14,
      amountCents: 29158,
      totalCount: 12,
      paidCount: 9,
      startDate: '2025-12-14',
    }),
    '2026-09-05',
  );

  assert.ok(c.remaining, 'a debt reports what is left');
  assert.equal(c.remaining.count, 3);
  assert.equal(c.remaining.cents, 3 * 29158);
  assert.equal(c.remaining.finishes.slice(0, 7), '2026-11', 'twelfth installment from December');
});

check('uma divida quitada some dos compromissos', () => {
  const paid = monthly({
    id: 'done',
    kind: 'debt',
    amountCents: 10000,
    totalCount: 6,
    paidCount: 6,
    startDate: '2026-01-10',
  });
  const live = monthly({ id: 'live', amountCents: 20000 });

  const c = commitments([paid, live], '2026-09-05');
  assert.equal(c.debts.length, 0, 'nothing is owed on it any more');
  assert.equal(c.monthlyOut, 20000, 'and it does not weigh on the month either');
});

check('o livre por mes e a renda menos tudo que ja esta prometido', () => {
  const list = [
    monthly({ id: 'sal', amountCents: 740000, direction: 'in', kind: 'inflow', dayOfMonth: 5 }),
    monthly({ id: 'rent', amountCents: 185000, dayOfMonth: 3 }),
    monthly({ id: 'card', kind: 'card', amountCents: 124000, dayOfMonth: 10 }),
    monthly({
      id: 'debt',
      kind: 'debt',
      amountCents: 43000,
      dayOfMonth: 22,
      totalCount: 24,
      paidCount: 8,
      startDate: '2026-01-22',
    }),
  ];

  const c = commitments(list, '2026-09-05');
  assert.equal(c.monthlyIn, 740000);
  assert.equal(c.monthlyOut, 185000 + 124000 + 43000, 'card statements are committed outflow too');
  assert.equal(c.free, 740000 - 352000);

  // Debts are kept apart from ordinary outflow because the reading is different, but they are still
  // weight on the month.
  assert.equal(c.out.length, 2);
  assert.equal(c.debts.length, 1);
  assert.equal(c.in.length, 1);
});

check('o livre fica negativo quando os compromissos nao cabem', () => {
  const c = commitments(
    [
      monthly({ id: 'sal', amountCents: 200000, direction: 'in', kind: 'inflow' }),
      monthly({ id: 'rent', amountCents: 250000 }),
    ],
    '2026-09-05',
  );
  assert.equal(c.free, -50000, 'the commitments alone do not fit');
});

check('uma divida a receber entra no mes sem se misturar com renda recorrente', () => {
  const c = commitments(
    [
      monthly({ id: 'sal', amountCents: 200000, direction: 'in', kind: 'inflow' }),
      monthly({
        id: 'receber',
        amountCents: 50000,
        direction: 'in',
        kind: 'debt',
        totalCount: 4,
        paidCount: 1,
      }),
    ],
    '2026-09-05',
  );
  assert.equal(c.monthlyIn, 250000, 'a parcela a receber participa da projeção do mês');
  assert.equal(c.in.length, 1, 'salário continua em entra todo mês');
  assert.equal(c.receivables.length, 1, 'o finito aparece em você recebe');
  assert.equal(c.receivables[0].remaining.cents, 150000);
});

check('parcelas pagas e data de inicio sao a mesma coisa dita duas vezes', () => {
  // The mutation trap: `remaining` counts from `paidCount`, while the engine numbers installments
  // from `startDate`. Editing "parcelas já pagas" without moving the start makes the ledger and the
  // screen disagree about which installment comes next. The form derives one from the other, and
  // this is that rule stated as arithmetic.
  const today = '2026-09-05';

  for (const paidCount of [0, 1, 5, 8, 23]) {
    const totalCount = 24;
    const startDate = paidCount <= 0 ? today : dayKey(startOfMonth(subMonths(parseDay(today), paidCount)));
    const debt = monthly({
      kind: 'debt',
      dayOfMonth: 22,
      amountCents: 43000,
      totalCount,
      paidCount,
      startDate,
    });

    const c = commitmentFor(debt, today);
    assert.equal(c.remaining.count, totalCount - paidCount, 'paid ' + paidCount);

    // The next occurrence the engine produces must be the one the screen says is next.
    const next = occurrences(debt, today, '2027-12-31')[0];
    assert.ok(next, 'a live debt always has a next installment');
    assert.equal(next.installment.n, paidCount + 1, 'engine and screen agree at paid ' + paidCount);
    assert.equal(next.installment.of, totalCount);
  }
});

check('pagar a fatura nao e gastar', () => {
  const cardSeries = monthly({ id: 'fat', kind: 'card', title: 'Fatura', category: 'Cartão', amountCents: 50000 });

  const list = [
    // A grocery run on the card, on the day it happened.
    entry({ id: 'buy', date: '2026-09-03', amountCents: 30000, category: 'Mercado', accountId: 'c' }),
    // The statement that settles it, a month later, out of the checking account.
    entry({ id: 'pay', date: '2026-10-10', amountCents: 30000, category: 'Cartão', accountId: 'a', seriesId: 'fat' }),
  ];

  const payments = paymentSeries([cardSeries]);

  // The purchase is spend, on its own category, on its own day.
  assert.deepEqual(spendByCategory(list, '2026-09-01', '2026-09-30', payments), [
    { category: 'Mercado', cents: 30000 },
  ]);

  // The payment is not. Counting it would report the same grocery run twice — once as Mercado when
  // it was bought and again as Cartão when the bill arrived.
  assert.deepEqual(spendByCategory(list, '2026-10-01', '2026-10-31', payments), []);

  // And over a window holding both, the money is counted exactly once.
  const both = spendByCategory(list, '2026-09-01', '2026-10-31', payments);
  assert.equal(both.reduce((n, c) => n + c.cents, 0), 30000, 'one purchase, one figure');
});

check('so a serie de cartao e transferencia; uma conta comum nao', () => {
  const card = monthly({ id: 'fat', kind: 'card', title: 'Fatura', category: 'Cartão' });
  const rent = monthly({ id: 'rent', kind: 'outflow', title: 'Aluguel', category: 'Moradia' });
  const payments = paymentSeries([card, rent]);

  assert.equal(payments.has('fat'), true);
  assert.equal(payments.has('rent'), false, 'settling the rent is spending on rent');

  // Derived from `kind`, never from the category name: "Cartão" is a word the owner may rename or
  // type on an ordinary bill, while `kind: 'card'` is a fact about the model.
  const named = entry({ id: 'x', category: 'Cartão', seriesId: 'rent' });
  assert.equal(isSpend(named, payments), true);
});

check('uma entrada nunca e gasto, venha de onde vier', () => {
  const payments = paymentSeries([monthly({ id: 'fat', kind: 'card' })]);
  assert.equal(isSpend(entry({ direction: 'in', seriesId: null }), payments), false);
  assert.equal(isSpend(entry({ direction: 'in', seriesId: 'fat' }), payments), false);
  assert.equal(isSpend(entry({ direction: 'out', seriesId: null }), payments), true);
  assert.equal(isSpend(entry({ direction: 'out', seriesId: 'fat' }), payments), false);
});

check('uma compra no cartao nao mexe no saldo, e a fatura mexe', () => {
  const cardSeries = monthly({ id: 'fat', kind: 'card' });
  const buy = entry({ id: 'buy', date: '2026-09-03', amountCents: 30000, accountId: 'c' });
  const pay = entry({ id: 'pay', date: '2026-09-10', amountCents: 30000, accountId: 'a', seriesId: 'fat' });

  // A credit line holds no money, so charging it moves nothing the owner can spend.
  assert.equal(balanceToday(acc, [buy], '2026-09-30'), 0);
  // The settlement leaves the checking account, and that is the moment the balance falls.
  assert.equal(balanceToday(acc, [buy, pay], '2026-09-30'), -30000);

  // The tape agrees: it walks the same accounts the balance does, so the purchase is not on it.
  const tape = ledgerTape(acc, [buy, pay], [cardSeries], '2026-09-30', '2026-09-01', '2026-09-30');
  assert.deepEqual(tape.flatMap((d) => d.items).map((i) => i.key), ['pay'], 'only the settlement');
});

check('a analise conta a compra e ignora o pagamento', () => {
  const cardSeries = monthly({ id: 'fat', kind: 'card', title: 'Fatura' });
  const list = [
    entry({ id: 'jul', date: '2026-07-01', amountCents: 20000, accountId: 'c' }),
    entry({ id: 'ago', date: '2026-08-02', amountCents: 20000, accountId: 'c' }),
    entry({ id: 'set', date: '2026-09-02', amountCents: 60000, accountId: 'c' }),
    // Three statements, each settling the month before. None of them is spend.
    entry({ id: 'p1', date: '2026-08-10', amountCents: 20000, accountId: 'a', seriesId: 'fat' }),
    entry({ id: 'p2', date: '2026-09-10', amountCents: 20000, accountId: 'a', seriesId: 'fat' }),
  ];

  const pace = spendPace(list, [cardSeries], '2026-09-05', 6);
  assert.equal(pace.basis, 2, 'July and August');
  assert.equal(pace.usual, 20000, 'the purchases, not the statements');
  assert.equal(pace.spent, 60000);
  assert.equal(pace.delta, 40000);

  // Had the statements been counted, August through day 5 would have held its own purchase plus
  // July's bill, and the median would have been wrong in the owner's favour.
});

check('um estorno abate a fatura', () => {
  const c = card();
  const s = statementCycle(c, '2026-09-20');
  const list = [
    entry({ id: 'buy', date: '2026-09-02', amountCents: 30000, accountId: 'card' }),
    entry({ id: 'ref', date: '2026-09-04', amountCents: 10000, accountId: 'card', direction: 'in' }),
  ];

  assert.equal(statementTotal(list, c, s), 20000, 'a returned purchase is not owed');

  // A refund is money coming back on the line the purchase went out on. It is netted, not dropped,
  // so a month with more refunds than purchases really does owe nothing and says so.
  const heavy = [...list, entry({ id: 'big', date: '2026-09-05', amountCents: 40000, accountId: 'card', direction: 'in' })];
  assert.equal(statementTotal(heavy, c, s), -20000);
});

check('OTTO nao fala quando o mes nao mergulha', () => {
  const rich = [
    monthly({ id: 'sal', kind: 'inflow', direction: 'in', amountCents: 900000, dayOfMonth: 5 }),
    monthly({ id: 'rent', amountCents: 100000, dayOfMonth: 10 }),
  ];
  const list = [entry({ id: 'open', date: '2026-08-31', amountCents: 500000, direction: 'in' })];

  // A month that comfortably survives has nothing to say, and saying nothing is the correct and the
  // common outcome. An alert that fires every month is furniture that vibrates.
  assert.deepEqual(alertsFor(acc, list, rich, '2026-09-01'), []);
});

check('o alerta do vermelho chega na vespera e nomeia a causa', () => {
  const series = [monthly({ id: 'rent', title: 'Aluguel', amountCents: 200000, dayOfMonth: 10 })];
  const list = [entry({ id: 'open', date: '2026-08-31', amountCents: 150000, direction: 'in' })];

  const [a] = alertsFor(acc, list, series, '2026-09-01');
  assert.ok(a, 'a month that goes under has something to say');
  assert.equal(a.kind, 'trough');
  assert.equal(a.date, '2026-09-09', 'the eve of the crossing, while there is still time to act');
  assert.ok(a.title.includes('10'), 'names the day it happens');
  assert.ok(a.body.includes('Aluguel'), 'names what causes it');
  assert.ok(a.body.includes('500'), 'and says how far under: 1500 - 2000');
});

check('um alerta nunca e agendado para o passado', () => {
  const series = [monthly({ id: 'rent', amountCents: 200000, dayOfMonth: 10 })];
  const list = [entry({ id: 'open', date: '2026-08-31', amountCents: 150000, direction: 'in' })];

  // On the eve it still speaks, and never into the past.
  const [eve] = alertsFor(acc, list, series, '2026-09-09');
  assert.ok(eve, 'still worth saying on the eve');
  assert.equal(eve.date, '2026-09-09');

  /*
   * On the day itself, and after it, the warning stands.
   *
   * This used to assert silence, on the argument that the app could not know whether the rent had
   * been paid once its day arrived. That argument was true of a date boundary and is not true of
   * identity: an entry settling the occurrence removes it, and nothing settled this one, so the
   * rent is not "maybe paid" — it is owed and late. Going quiet there was the bug, not the manners.
   */
  const [onTheDay] = alertsFor(acc, list, series, '2026-09-10');
  assert.ok(onTheDay, 'a conta venceu e nao foi paga: continua valendo o aviso');
  assert.equal(onTheDay.date, '2026-09-10', 'datado de hoje, nunca do passado');
  assert.ok(onTheDay.body.includes('Aluguel'), 'e ainda diz qual conta e');

  // Still true two days later, and still never dated behind today.
  const [later] = alertsFor(acc, list, series, '2026-09-12');
  assert.equal(later.date, '2026-09-12');

  // And it stops being late the moment something settles it — by identity, not by the calendar.
  assert.equal(overdue(series, list, '2026-09-12', NO_DEFERRALS).length, 1, 'devido enquanto ninguem paga');
  const paid = [...list, entry({ id: 'r', seriesId: 'rent', settlesDate: '2026-09-10', date: '2026-09-10', amountCents: 200000 })];
  assert.deepEqual(overdue(series, paid, '2026-09-12', NO_DEFERRALS), [], 'pago: nao esta mais vencido');
});

check('o mergulho e anunciado uma vez, na primeira travessia', () => {
  const series = [
    monthly({ id: 'a', title: 'Aluguel', amountCents: 200000, dayOfMonth: 10 }),
    monthly({ id: 'b', title: 'Cartão', amountCents: 100000, dayOfMonth: 20 }),
  ];
  const list = [entry({ id: 'open', date: '2026-08-31', amountCents: 150000, direction: 'in' })];

  // The month dips on the 10th and dips further on the 20th. Only the first crossing can still be
  // prevented; the rest are consequences of it.
  const troughs = alertsFor(acc, list, series, '2026-09-01').filter((a) => a.kind === 'trough');
  assert.equal(troughs.length, 1);
  assert.equal(troughs[0].id, 'trough:2026-09-10');
});

check('nada e dito sobre um mergulho distante demais para ser firme', () => {
  const series = [monthly({ id: 'rent', amountCents: 200000, dayOfMonth: 28 })];
  const list = [entry({ id: 'open', date: '2026-08-31', amountCents: 150000, direction: 'in' })];

  // Beyond a fortnight a forecast is not firm enough to wake someone up for.
  assert.deepEqual(alertsFor(acc, list, series, '2026-09-01'), []);
  // And once it is inside the window, it speaks.
  assert.equal(alertsFor(acc, list, series, '2026-09-15').length, 1);
});

check('a fatura avisa no fechamento, nao no vencimento', () => {
  const c = card();
  const list = [entry({ id: 'buy', date: '2026-09-02', amountCents: 30000, accountId: 'card' })];

  const [a] = alertsFor([...acc, c], list, [], '2026-09-20');
  assert.ok(a, 'a statement with something on it is worth a word');
  assert.equal(a.kind, 'statement');
  assert.equal(a.date, '2026-09-28', 'the closing day, not the due date');
  assert.ok(a.body.includes('300'), 'says what is on it');

  // On the due date there is nothing left to decide: the figure is fixed and the owner is only being
  // told about a bill they already know about.
  assert.equal(a.date, statementCycle(c, '2026-09-20').closes);
});

check('uma fatura vazia nao merece uma interrupcao', () => {
  const c = card();
  assert.deepEqual(alertsFor([...acc, c], [], [], '2026-09-20'), []);

  // Nor does one that has already closed: nothing can be added to it any more.
  const list = [entry({ id: 'buy', date: '2026-09-02', amountCents: 30000, accountId: 'card' })];
  assert.deepEqual(alertsFor([...acc, c], list, [], '2026-09-29'), []);
});

check('o id de um alerta sobrevive a mudanca do valor', () => {
  const series = [monthly({ id: 'rent', amountCents: 200000, dayOfMonth: 10 })];
  const thin = [entry({ id: 'open', date: '2026-08-31', amountCents: 150000, direction: 'in' })];
  // Dated today, not tomorrow: the curve reads recorded entries for days that have arrived and
  // projections for days that have not, so an entry in the future is not part of the forecast.
  const thinner = [...thin, entry({ id: 'extra', date: '2026-09-01', amountCents: 20000 })];

  // Rescheduling must replace an alert, not stack a second one beside it. The id carries the date
  // and the shape, never the amount.
  const a = alertsFor(acc, thin, series, '2026-09-01')[0];
  const b = alertsFor(acc, thinner, series, '2026-09-01')[0];
  assert.equal(a.id, b.id);
  assert.notEqual(a.body, b.body, 'the figure did change');
});

check('um numero sem virgula e reais inteiros: 20 vale 20 reais, nao 20 centavos', () => {
  assert.equal(draftCents(parseMoneyDraft('20')), 2000);
  assert.equal(draftCents(parseMoneyDraft('200')), 20000, 'mais um zero, vira 200 reais');
  assert.equal(draftCents(parseMoneyDraft('0')), 0);
  assert.equal(draftCents(parseMoneyDraft('')), 0);
});

check('a virgula troca para centavos, e um digito so e a casa da dezena', () => {
  assert.equal(draftCents(parseMoneyDraft('20,50')), 2050);
  assert.equal(draftCents(parseMoneyDraft('20,5')), 2050, 'um digito depois da virgula sao os dez centavos');
  assert.equal(draftCents(parseMoneyDraft('0,05')), 5);
  assert.equal(draftCents(parseMoneyDraft(',99')), 99, 'sem parte inteira, ainda le os centavos');
});

check('tanto virgula quanto ponto disparam a casa decimal', () => {
  // Both, because this function only ever reads text the owner actually typed, and not every
  // system keyboard's decimal key sends ",". Refusing one of the two is not "inteligente" — it is
  // a field that works on some phones and not others.
  assert.equal(draftCents(parseMoneyDraft('20,50')), 2050);
  assert.equal(draftCents(parseMoneyDraft('20.50')), 2050);
  assert.equal(draftCents(parseMoneyDraft('1234,56')), 123456);
});

check('mais de duas casas depois da virgula param de entrar', () => {
  assert.equal(draftCents(parseMoneyDraft('20,999')), 2099, 'apenas os dois primeiros digitos contam');
});

check('o formato agrupado nunca deve ser relido pelo parser: e essa a razao de existir', () => {
  // The one asymmetry this whole design rests on. `formatMoneyDraft` inserts "." for thousands, and
  // `parseMoneyDraft` treats "." as a decimal trigger — deliberately, since a live buffer never
  // contains one. Feeding the grouped form back in is exactly the mistake `MoneyField` must not
  // make, and this proves why: for a whole part of 1000 or more, doing so gives the wrong figure.
  const d = parseMoneyDraft('1234,56');
  const shown = formatMoneyDraft(d);
  assert.equal(shown, '1.234,56');
  assert.notEqual(
    draftCents(parseMoneyDraft(shown)),
    draftCents(d),
    'reparsing the grouped display silently corrupts a four-digit real — the exact trap the API docs warn against',
  );

  // Below the first grouping dot there is nothing to trip over, so the round trip happens to hold —
  // coincidence of scale, not a guarantee the component is allowed to lean on.
  for (const raw of ['20', '0', '20,5', '20,50', '0,05', ',9']) {
    const once = parseMoneyDraft(raw);
    assert.equal(draftCents(parseMoneyDraft(formatMoneyDraft(once))), draftCents(once));
  }
});

check('um campo vazio mostra vazio, nao "R$ 0"', () => {
  assert.equal(formatMoneyDraft(parseMoneyDraft('')), '');
});

check('draftFromCents e parseMoneyDraft sao inversas ate o centavo', () => {
  for (const cents of [0, 2000, 2050, 5, 123456, 99, 1]) {
    assert.equal(draftCents(draftFromCents(cents)), cents, 'cents=' + cents);
  }
  // Editing an existing figure of exactly zero is a real state (an account really can open at
  // R$0,00) and must be distinguished from a field that was never touched.
  assert.deepEqual(draftFromCents(0), { whole: '', cents: '', hasComma: false });
  assert.deepEqual(draftFromCents(null), draftFromCents(undefined));
});

/*
 * Antecipar: receber ou pagar antes do dia marcado.
 *
 * The engine used to split fact from forecast at `today` and nowhere else, which is correct only
 * while money arrives on the day it was promised. These are the checks that the split is now an
 * identity — the pair (series, dia marcado) — rather than a date comparison.
 */
const salary = monthly({
  id: 'sal',
  kind: 'inflow',
  title: 'Salário',
  category: 'Renda',
  amountCents: 740000,
  direction: 'in',
  dayOfMonth: 5,
});

check('o salario recebido no dia 3 nao volta a cair no dia 5', () => {
  const early = entry({
    id: 'e1',
    seriesId: 'sal',
    settlesDate: '2026-09-05',
    date: '2026-09-03',
    amountCents: 740000,
    direction: 'in',
    title: 'Salário',
    category: 'Renda',
  });
  const naive = monthCurve(acc, [], [salary], '2026-09-03');
  const withEarly = monthCurve(acc, [early], [salary], '2026-09-03');

  // O mes fecha no mesmo lugar: o dinheiro entrou uma vez, so que antes.
  assert.equal(naive.balanceEnd, 740000);
  assert.equal(withEarly.balanceEnd, 740000, 'nao pode contar duas vezes');
  assert.equal(withEarly.inflow, 740000);
  // E hoje ele ja esta na mao, que e a diferenca inteira que o dono queria.
  assert.equal(naive.balanceNow, 0);
  assert.equal(withEarly.balanceNow, 740000);
});

check('o dia 5 deixa de ser previsto depois de antecipado', () => {
  const early = entry({
    id: 'e1', seriesId: 'sal', settlesDate: '2026-09-05', date: '2026-09-03',
    amountCents: 740000, direction: 'in', title: 'Salário', category: 'Renda',
  });
  assert.equal(dayItems([early], [salary], '2026-09-05', '2026-09-03').length, 0);
  assert.equal(dayItems([], [salary], '2026-09-05', '2026-09-03').length, 1);
});

check('a assinatura antecipada volta no mes seguinte, no dia de sempre', () => {
  const early = entry({
    id: 'e1', seriesId: 'sal', settlesDate: '2026-09-05', date: '2026-09-03',
    amountCents: 740000, direction: 'in', title: 'Salário', category: 'Renda',
  });
  const next = project([salary], '2026-09-01', '2026-10-31', settled([early]));
  assert.deepEqual(next.map((o) => o.date), ['2026-10-05']);
});

check('antecipar nao mexe na regra: apagar o lancamento devolve a ocorrencia', () => {
  const back = project([salary], '2026-09-01', '2026-09-30', settled([]));
  assert.deepEqual(back.map((o) => o.date), ['2026-09-05']);
});

check('outubro recebido em setembro liquida outubro, nao setembro', () => {
  const cross = entry({
    id: 'e1', seriesId: 'sal', settlesDate: '2026-10-05', date: '2026-09-28',
    amountCents: 740000, direction: 'in', title: 'Salário', category: 'Renda',
  });
  const open = project([salary], '2026-09-01', '2026-10-31', settled([cross]));
  assert.deepEqual(open.map((o) => o.date), ['2026-09-05'], 'setembro segue de pe');
});

check('um lancamento antigo, sem dia marcado, ainda liquida o dia em que caiu', () => {
  const legacy = entry({
    id: 'e1', seriesId: 'sal', settlesDate: null, date: '2026-09-05',
    amountCents: 740000, direction: 'in', title: 'Salário', category: 'Renda',
  });
  assert.deepEqual(project([salary], '2026-09-01', '2026-09-30', settled([legacy])), []);
});

check('nextOpen aponta a ocorrencia que a antecipacao deve liquidar', () => {
  assert.equal(nextOpen(salary, [], '2026-09-03').date, '2026-09-05');
  // Ja passou do dia e ninguem lancou: e essa mesma ocorrencia que esta em aberto, nao a de outubro.
  assert.equal(nextOpen(salary, [], '2026-09-07').date, '2026-09-05');
  const done = entry({
    id: 'e1', seriesId: 'sal', settlesDate: '2026-09-05', date: '2026-09-03',
    amountCents: 740000, direction: 'in', title: 'Salário', category: 'Renda',
  });
  assert.equal(nextOpen(salary, [done], '2026-09-03').date, '2026-10-05');
});

check('a parcela antecipada nao encurta a divida: 12 continuam 12', () => {
  const debt = monthly({
    id: 'd', kind: 'debt', title: 'Notebook', category: 'Dívidas',
    amountCents: 29158, dayOfMonth: 14, startDate: '2026-09-01',
    totalCount: 12, paidCount: 0,
  });
  const early = entry({
    id: 'e1', seriesId: 'd', settlesDate: '2026-09-14', date: '2026-09-02',
    amountCents: 29158, direction: 'out', title: 'Notebook', category: 'Dívidas',
  });
  const all = occurrences(debt, '2026-09-01', '2027-12-31');
  const open = project([debt], '2026-09-01', '2027-12-31', settled([early]));
  assert.equal(all.length, 12, 'a regra continua com doze parcelas');
  assert.equal(open.length, 11, 'uma foi paga, onze seguem em aberto');
  assert.equal(open[open.length - 1].installment.n, 12, 'e a ultima ainda e a decima segunda');
});

check('o custo anual de uma regra ignora a antecipacao: e a regra, nao o caixa', () => {
  const early = entry({
    id: 'e1', seriesId: 'sal', settlesDate: '2026-09-05', date: '2026-09-03',
    amountCents: 740000, direction: 'in', title: 'Salário', category: 'Renda',
  });
  assert.equal(commitmentFor(salary, '2026-09-03').yearCents, 740000 * 12);
  assert.equal(commitmentFor(salary, '2026-09-03').count, 12);
  assert.equal(settled([early]).has(occurrenceKey('sal', '2026-09-05')), true);
});

check('a antecipacao nao vira uma segunda ocorrencia fantasma na fita', () => {
  const early = entry({
    id: 'e1', seriesId: 'sal', settlesDate: '2026-09-05', date: '2026-09-03',
    amountCents: 740000, direction: 'in', title: 'Salário', category: 'Renda',
  });
  const tape = ledgerTape(acc, [early], [salary], '2026-09-03', '2026-09-01', '2026-09-30');
  const rows = tape.flatMap((d) => d.items).filter((i) => i.title === 'Salário');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].settled, true);
  assert.equal(tape[tape.length - 1].balance, 740000);
});




/*
 * Tetos por categoria.
 *
 * The reading these checks defend is the pace one: R$ 240 of R$ 300 means opposite things on the
 * 5th and on the 28th, and a percentage cannot tell those apart. Everything below is about the
 * arithmetic that can.
 */
const spentOn = (date, cents, category = 'Alimentação') =>
  entry({ id: 'x' + date + cents, date, amountCents: cents, direction: 'out', category, title: category });

check('o teto le o gasto do mes na categoria, e so nela', () => {
  const es = [
    spentOn('2026-09-02', 5000),
    spentOn('2026-09-03', 7000),
    spentOn('2026-09-03', 9900, 'Transporte'),
    spentOn('2026-08-31', 4000),
  ];
  const r = capReading({ category: 'Alimentação', capCents: 30000 }, es, [], '2026-09-05');
  assert.equal(r.spent, 12000, 'agosto e Transporte ficam de fora');
  assert.equal(r.leftCents, 18000);
});

check('o mesmo valor e tranquilo no fim do mes e alarmante no comeco', () => {
  const cap = { category: 'Alimentação', capCents: 30000 };
  const es = [spentOn('2026-09-01', 24000)];

  // Dia 5: R$ 240 gastos em cinco dias projeta R$ 1.440 no mes. Estoura, e cedo.
  const early = capReading(cap, es, [], '2026-09-05');
  assert.equal(early.projectedCents, 144000);
  assert.equal(early.burstsOn, '2026-09-07', 'no ritmo, o teto quebra dia 7');

  // Dia 28: os mesmos R$ 240 projetam R$ 257. O teto sobrevive, e nada e dito.
  const late = capReading(cap, es, [], '2026-09-28');
  assert.equal(late.projectedCents, 25714);
  assert.equal(late.burstsOn, null, 'no fim do mes o mesmo valor nao alarma');
});

check('o dia em que ja estourou e lido do razao, nao do ritmo', () => {
  const es = [
    spentOn('2026-09-02', 10000),
    spentOn('2026-09-09', 15000),
    spentOn('2026-09-11', 8000),
  ];
  const r = capReading({ category: 'Alimentação', capCents: 30000 }, es, [], '2026-09-20');
  assert.equal(r.spent, 33000);
  assert.equal(r.burstsOn, '2026-09-11', 'o dia real da travessia, nao um estimado');
  assert.equal(r.leftCents, -3000);
  assert.equal(r.perDayCents, 0, 'nao sobra nada por dia depois de estourar');
});

check('quanto ainda da para gastar por dia', () => {
  const r = capReading(
    { category: 'Alimentação', capCents: 30000 },
    [spentOn('2026-09-01', 24000)],
    [],
    '2026-09-25',
  );
  assert.equal(r.daysLeft, 6, 'hoje conta: 25 a 30');
  assert.equal(r.perDayCents, 1000, 'R$ 60 divididos por seis dias');
});

check('um teto sem gasto nenhum le zero, nao some', () => {
  const r = capReading({ category: 'Lazer', capCents: 20000 }, [], [], '2026-09-10');
  assert.equal(r.spent, 0);
  assert.equal(r.used, 0);
  assert.equal(r.burstsOn, null);
  assert.equal(r.projectedCents, 0);
});

check('a fatura do cartao nao consome o teto: quem consome e a compra', () => {
  const cardSeries = monthly({ id: 'fat', kind: 'card', title: 'Fatura', category: 'Alimentação', dayOfMonth: 10 });
  const buy = entry({ id: 'b', date: '2026-09-03', amountCents: 5000, direction: 'out', category: 'Alimentação', title: 'Mercado', accountId: 'c' });
  const pay = entry({ id: 'p', seriesId: 'fat', date: '2026-09-10', amountCents: 5000, direction: 'out', category: 'Alimentação', title: 'Fatura' });
  const r = capReading({ category: 'Alimentação', capCents: 30000 }, [buy, pay], [cardSeries], '2026-09-15');
  assert.equal(r.spent, 5000, 'a compra conta uma vez; a fatura e transferencia');
});

check('os tetos saem ordenados pelo quanto foi consumido, nao pelo tamanho', () => {
  const es = [spentOn('2026-09-01', 28500), spentOn('2026-09-01', 60000, 'Lazer')];
  const out = capReadings(
    [
      { category: 'Lazer', capCents: 200000 },
      { category: 'Alimentação', capCents: 30000 },
    ],
    es,
    [],
    '2026-09-10',
  );
  assert.deepEqual(out.map((r) => r.category), ['Alimentação', 'Lazer']);
});

check('o alerta de teto so fala quando o ritmo realmente quebra', () => {
  const cap = [{ category: 'Alimentação', capCents: 30000 }];
  const calm = alertsFor(acc, [spentOn('2026-09-01', 5000)], [], '2026-09-20', cap);
  assert.equal(calm.filter((a) => a.kind === 'cap').length, 0, 'um teto que aguenta nao interrompe');

  const loud = alertsFor(acc, [spentOn('2026-09-01', 24000)], [], '2026-09-05', cap);
  const said = loud.find((a) => a.kind === 'cap');
  assert.ok(said, 'um teto que nao chega ao fim do mes fala');
  assert.equal(said.date, '2026-09-06', 'amanha de manha, nunca hoje: hoje as 9h ja passou');
  assert.match(said.body, /dia 7/);
});

check('o id do alerta de teto e estavel no mes, mesmo com o dia da quebra mudando', () => {
  const cap = [{ category: 'Alimentação', capCents: 30000 }];
  const a = alertsFor(acc, [spentOn('2026-09-01', 24000)], [], '2026-09-05', cap).find((x) => x.kind === 'cap');
  const b = alertsFor(acc, [spentOn('2026-09-01', 29000)], [], '2026-09-06', cap).find((x) => x.kind === 'cap');
  assert.equal(a.id, b.id, 'o mesmo aviso atualiza em vez de virar um segundo');
  assert.notEqual(a.body, b.body, 'e o texto acompanha os numeros');
});

check('no ultimo dia do mes nao se avisa sobre um mes que acaba hoje', () => {
  const said = alertsFor(acc, [spentOn('2026-09-01', 29000)], [], '2026-09-30', [
    { category: 'Alimentação', capCents: 30000 },
  ]);
  assert.equal(said.filter((a) => a.kind === 'cap').length, 0);
});

check('sem teto nenhum, nada muda nos alertas de sempre', () => {
  const before = alertsFor(acc, [spentOn('2026-09-01', 24000)], [], '2026-09-05');
  assert.equal(before.filter((a) => a.kind === 'cap').length, 0);
});


/*
 * Installment numbering, which is the one figure the owner reads off a receipt.
 *
 * The ordinal scheme these replace was verified wrong before the change: a debt with six declared,
 * parcela 7 deferred into November and November's own parcela 8 settled first was labelled 7.
 */

const moto = {
  ...monthly({
    id: 'moto',
    kind: 'debt',
    title: 'Moto',
    amountCents: 50000,
    dayOfMonth: 8,
    totalCount: 24,
    // Six installments declared paid, so parcela 7 is the first one OTTO ever projects. The debt
    // therefore begins six months before it: April, which puts 7 in October and 8 in November.
    startDate: '2026-04-08',
  }),
  paidCount: 6,
};

const payment = (scheduled, paid) => ({
  scheduled,
  paid,
  recordedAt: null,
  amountCents: 50000,
});

check('pagar fora de ordem numera a parcela certa', () => {
  // Parcela 7 (October) is deferred; November's own parcela 8 is paid first. This is the exact
  // sequence that produced a 7 under the ordinal scheme.
  const one = numbered([payment('2026-11-08', '2026-11-08')], 7, 24, moto.startDate);
  assert.deepEqual(one.payments.map((p) => p.n), [8], 'novembro e a oitava, nao a setima');

  // Then the deferred October installment is settled, late. Both keep their own numbers.
  const two = numbered(
    [payment('2026-11-08', '2026-11-08'), payment('2026-10-08', '2026-11-20')],
    8,
    24,
    moto.startDate,
  );
  assert.deepEqual(
    two.payments.map((p) => [p.scheduled, p.n]),
    [['2026-11-08', 8], ['2026-10-08', 7]],
    'cada parcela mantem o numero do seu proprio mes',
  );
  assert.equal(two.untracked, 6, 'as seis declaradas continuam sem registro');
});

check('a projecao e o historico concordam sobre o numero da parcela', () => {
  // The same installment, reached from both directions: projected as a forecast, and read back as a
  // recorded payment. The two must agree, or the owner sees one installment under two numbers.
  const projected = occurrences(moto, '2026-11-01', '2026-11-30');
  assert.equal(projected.length, 1);
  assert.equal(projected[0].installment.n, 8, 'novembro projeta a oitava');

  const recorded = numbered([payment('2026-11-08', '2026-11-08')], 7, 24, moto.startDate);
  assert.equal(recorded.payments[0].n, projected[0].installment.n, 'projecao == historico');
});

check('o leitor da divida compartilhada numera igual ao dono', () => {
  /*
   * `historyOf` (src/lib/debtShare.ts) only renames the public payload's fields and calls
   * `numbered`; it decides nothing. It cannot be imported here — the harness runs on Node's
   * strip-only TypeScript and `lib/api.ts` uses a parameter property — so this reproduces its call
   * with the payload's own field names. What is actually being guaranteed is that the numbering
   * needs nothing the public payload lacks: `startDate` and each payment's `scheduled` are already
   * in it, so a deferral never has to cross the API for the two readings to agree.
   */
  const publicPayload = {
    startDate: moto.startDate,
    totalCount: 24,
    paidCount: 7,
    payments: [{ scheduled: '2026-11-08', paidOn: '2026-11-08', recordedAt: null, amountCents: 50000 }],
  };
  const web = numbered(
    publicPayload.payments.map((p) => ({
      scheduled: p.scheduled,
      paid: p.paidOn,
      recordedAt: p.recordedAt,
      amountCents: p.amountCents,
    })),
    publicPayload.paidCount,
    publicPayload.totalCount,
    publicPayload.startDate,
  );

  const owner = debtHistory({ ...moto, paidCount: 7 }, [
    entry({ id: 'p8', seriesId: 'moto', settlesDate: '2026-11-08', date: '2026-11-08', amountCents: 50000 }),
  ]);

  assert.deepEqual(
    web.payments.map((p) => p.n),
    owner.payments.map((p) => p.n),
    'web e app veem o mesmo numero',
  );
  assert.equal(owner.payments[0].n, 8);
});

check('numero da parcela e unico mesmo com startDate deslizado', () => {
  /*
   * Rows written before the start date was frozen can carry a slid anchor, and a legacy row with no
   * `settlesDate` falls back to the day it was paid — either can put two payments in one month and
   * ask for the same number twice. The ordinal floor is what stops that.
   */
  const slid = { ...moto, startDate: '2026-09-08' };
  const history = debtHistory({ ...slid, paidCount: 9 }, [
    // Three payments whose scheduled months collapse onto one another under the slid anchor.
    entry({ id: 'a', seriesId: 'moto', settlesDate: null, date: '2026-09-03', amountCents: 50000 }),
    entry({ id: 'b', seriesId: 'moto', settlesDate: null, date: '2026-09-19', amountCents: 50000 }),
    entry({ id: 'c', seriesId: 'moto', settlesDate: null, date: '2026-09-27', amountCents: 50000 }),
  ]);
  const ns = history.payments.map((p) => p.n);
  assert.equal(new Set(ns).size, ns.length, `numeros repetidos: ${ns.join(', ')}`);
});


/*
 * The overdue window and deferral, which are one mechanism seen from two sides.
 */

check('o que venceu e nao foi pago aparece — e continua sendo cobrado', () => {
  /*
   * The exact case that started this: rent due on the 8th, today is the 9th, nothing paid. It used
   * to vanish from every surface *and* from the forecast — verified before the change, the month
   * opened, stood and closed on the same figure with R$ 1.800 of rent owed inside it.
   */
  const rent = monthly({ id: 'rent', title: 'Aluguel', amountCents: 180000, dayOfMonth: 8 });
  const open = [entry({ id: 'saldo', date: '2026-09-01', amountCents: 500000, direction: 'in' })];
  const today = '2026-09-09';

  const late = overdue([rent], open, today, NO_DEFERRALS);
  assert.equal(late.length, 1, 'a ocorrencia vencida existe');
  assert.equal(late[0].date, '2026-09-08');

  const curve = monthCurveWith(acc, open, [rent], today, NO_DEFERRALS);
  assert.equal(curve.overdueCents, 180000, 'a tela recebe o total vencido, nomeado');

  // The money has not moved, so today's balance must not pretend it has.
  assert.equal(curve.balanceNow, 500000, 'saldo de hoje e so o que foi registrado');
  // But the month is still on the hook for it.
  assert.equal(curve.balanceEnd, 320000, 'o fim do mes conta o aluguel devido');

  // And the tape draws the row on the day it was due while moving no balance on it.
  const tape = ledgerTapeWith(acc, open, [rent], today, '2026-09-01', '2026-09-30', NO_DEFERRALS);
  const day8 = tape.find((d) => d.date === '2026-09-08');
  assert.ok(day8, 'o dia 8 aparece na fita');
  assert.equal(day8.items.length, 1);
  assert.equal(day8.items[0].overdue, true);
  assert.equal(day8.moved, 0, 'uma conta nao paga nao move saldo nenhum');
});

check('adiar move a ocorrencia sem mexer na regra nem no numero', () => {
  // Parcela 7 (8 de outubro) empurrada para 8 de novembro, onde a 8 ja cai.
  const deferrals = deferralMap([
    { seriesId: 'moto', month: '2026-10', to: '2026-11-08', recordedAt: '2026-10-08T12:00:00Z' },
  ]);

  // Outubro fica vazio: a ocorrencia saiu de la.
  const october = projectWith([moto], '2026-10-01', '2026-10-31', new Set(), deferrals);
  assert.equal(october.length, 0, 'outubro nao cobra mais nada');

  // Novembro tem as duas, cada uma com o seu numero, e nessa ordem.
  const november = projectWith([moto], '2026-11-01', '2026-11-30', new Set(), deferrals);
  assert.deepEqual(november.map((o) => o.installment.n), [7, 8], 'a 7 adiada vem antes da 8 do mes');
  assert.equal(november[0].date, '2026-10-08', 'a identidade da 7 continua sendo outubro');
  assert.equal(november[0].on, '2026-11-08', 'so o dia em que ela cai mudou');
  assert.equal(november[1].date, '2026-11-08', 'a 8 e a do proprio mes');

  // A regra em si nao foi tocada: dezembro segue normal, na parcela 9.
  const december = projectWith([moto], '2026-12-01', '2026-12-31', new Set(), deferrals);
  assert.deepEqual(december.map((o) => o.installment.n), [9]);
});

check('pago a do mes, a adiada continua — e pode ser adiada de novo', () => {
  const first = deferralMap([
    { seriesId: 'moto', month: '2026-10', to: '2026-11-08', recordedAt: '2026-10-08T12:00:00Z' },
  ]);

  // Paga a parcela 8, a do proprio mes de novembro. A liquidacao e enderecada pela identidade dela.
  const paidTheEighth = settled([
    entry({ id: 'p8', seriesId: 'moto', settlesDate: '2026-11-08', date: '2026-11-08', amountCents: 50000 }),
  ]);
  const left = projectWith([moto], '2026-11-01', '2026-11-30', paidTheEighth, first);
  assert.equal(left.length, 1, 'sobra exatamente uma');
  assert.equal(left[0].installment.n, 7, 'e a 7, a que foi adiada — nao se perdeu');

  // Adiada outra vez, agora para dezembro. A chave continua sendo outubro, que e o que permite
  // encadear: um segundo adiamento lido pela data exibida moveria a parcela errada.
  const second = deferralMap([
    { seriesId: 'moto', month: '2026-10', to: '2026-12-08', recordedAt: '2026-11-08T12:00:00Z' },
  ]);
  const december = projectWith([moto], '2026-12-01', '2026-12-31', paidTheEighth, second);
  assert.deepEqual(december.map((o) => o.installment.n), [7, 9], 'a 7 chega em dezembro, junto da 9');
  assert.equal(december[0].date, '2026-10-08', 'e ainda e a de outubro');
});

check('adiar para tras nao existe: seria sumir para sempre', () => {
  // Anything landing on or before the original day is read as absent. A bill pushed backwards into
  // a closed month would be projected nowhere and listed as overdue nowhere.
  const backwards = deferralMap([
    { seriesId: 'moto', month: '2026-10', to: '2026-09-08', recordedAt: '2026-10-08T12:00:00Z' },
  ]);
  const october = projectWith([moto], '2026-10-01', '2026-10-31', new Set(), backwards);
  assert.deepEqual(october.map((o) => o.installment.n), [7], 'continua em outubro, onde a regra a poe');
});

check('uma parcela adiada para o mes que vem nao esta vencida hoje', () => {
  // Deferring is not the same as being late: the whole point is that it stops being due now.
  const rent = monthly({ id: 'rent', title: 'Aluguel', amountCents: 180000, dayOfMonth: 8 });
  const deferrals = deferralMap([
    { seriesId: 'rent', month: '2026-09', to: '2026-10-08', recordedAt: '2026-09-09T10:00:00Z' },
  ]);
  assert.deepEqual(overdue([rent], [], '2026-09-09', deferrals), [], 'adiada nao e vencida');
  assert.equal(overdue([rent], [], '2026-09-09', NO_DEFERRALS).length, 1, 'sem adiar, esta vencida');
});


console.log(`\n${pass} checagens de aritmetica passaram.`);

/**
 * What the home screen will actually show today.
 *
 * The sample generator is pure, so this is the exact ledger the device will hold, run through the
 * exact projection the device will run. Printing it means the numbers are known before anyone looks
 * at the screen — a balance that is merely plausible on a screenshot has not been verified.
 */

const today = new Date();
const iso = dayKey(today);
const { accounts, series, entries } = sampleMonth(today);
const curve = monthCurve(accounts, entries, series, iso);
const thirty = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
const spend = spendByCategory(entries, thirty, iso, paymentSeries(series));
const debts = debtStatus(series);

const tomorrow = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
const soon = upcoming(series, entries, tomorrow, 6).filter((o) => o.direction === 'out');

console.log(`\n--- o que a Home mostra em ${iso} ---`);
console.log(`razao gerado           ${entries.length} lancamentos, ${series.length} series`);
console.log(`saldo hoje             ${brl(curve.balanceNow)}`);
console.log(`fim do mes             ${brl(curve.balanceEnd)}`);
console.log(`menor ponto adiante    dia ${curve.trough.day} - ${brl(curve.trough.balance)}`);
console.log(`frase de negativo      ${curve.trough.balance < 0 ? 'RENDERIZA' : 'nao renderiza'}`);
console.log(`fluxo do mes           entradas ${brlShort(curve.inflow)} / saidas ${brlShort(curve.outflow)}`);
console.log(`proximos 7 dias        ${soon.length} a pagar, ${brl(soon.reduce((n, o) => n + o.amountCents, 0))}`);
console.log(`                       ${soon.map((o) => o.title).join(' - ') || '(nada)'}`);
console.log(`categorias 30 dias     ${spend.slice(0, 6).map((c) => `${c.category} ${brlShort(c.cents)}`).join(' / ')}`);
console.log(`dividas                ${debts.map((d) => `${d.series.title} ${d.paid}/${d.total} faltam ${brlShort(d.remainingCents)}`).join(' / ')}`);

// Anything the arithmetic itself calls impossible must never reach the screen.
assert.equal(curve.points[curve.todayIndex].balance, curve.balanceNow, 'curve passes through hero');
assert.ok(entries.length > 100, 'the sample must be dense enough to look like a real month');
assert.ok(spend.length >= 4, 'the category chart needs enough rows to be worth drawing');
