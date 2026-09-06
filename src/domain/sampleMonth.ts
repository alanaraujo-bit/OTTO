import { addDays, format, getDaysInMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import type { Account, Entry, Series } from './model';

/**
 * A plausible ledger, so the screens can be judged with real weight before capture exists.
 *
 * Pure on purpose: it returns rows and writes nothing. That is what lets `tools/ledger-check.mjs`
 * run the exact data the device will show through the exact projection the device will run, and
 * print the resulting balance — so the numbers on the screen are verified before anyone looks at it.
 *
 * Everything is generated relative to the day it runs. A sample with hardcoded dates shows a dead
 * screen the following month, which is worse than no sample at all. The randomness is seeded from a
 * fixed constant, so two runs on the same day produce the same ledger and any visual difference
 * between builds is a change someone made.
 *
 * This is scaffolding for review, not product. It goes when Fase 3 lands real capture.
 */

const ACCOUNT = 'acc-corrente';
const CARD = 'acc-cartao';

/** Mulberry32. Small, fast, and good enough that the spending does not visibly repeat. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = (d: Date) => format(d, 'yyyy-MM-dd');

interface Recurring {
  title: string;
  category: string;
  cents: number;
  on: number;
  kind: Series['kind'];
  direction: Series['direction'];
  total?: number;
  paid?: number;
}

const RECURRING: Recurring[] = [
  { title: 'Salário', category: 'Renda', cents: 740_000, on: 5, kind: 'inflow', direction: 'in' },
  { title: 'Aluguel', category: 'Moradia', cents: 185_000, on: 3, kind: 'outflow', direction: 'out' },
  { title: 'Fatura Nubank', category: 'Cartão', cents: 124_000, on: 10, kind: 'card', direction: 'out' },
  { title: 'Energia', category: 'Casa', cents: 21_460, on: 12, kind: 'outflow', direction: 'out' },
  { title: 'Internet', category: 'Casa', cents: 12_990, on: 9, kind: 'outflow', direction: 'out' },
  { title: 'Academia', category: 'Saúde', cents: 11_900, on: 15, kind: 'outflow', direction: 'out' },
  { title: 'Spotify', category: 'Assinaturas', cents: 2_190, on: 18, kind: 'outflow', direction: 'out' },
  { title: 'Netflix', category: 'Assinaturas', cents: 4_490, on: 20, kind: 'outflow', direction: 'out' },
  { title: 'Empréstimo pessoal', category: 'Dívidas', cents: 43_000, on: 22, kind: 'debt', direction: 'out', total: 24, paid: 8 },
  { title: 'Notebook', category: 'Dívidas', cents: 29_158, on: 14, kind: 'debt', direction: 'out', total: 12, paid: 5 },
];

/** Day-to-day spending: what a real month is actually made of between the fixed bills. */
const VARIABLE = [
  { title: 'Mercado', category: 'Mercado', low: 4_200, high: 19_800, odds: 0.3 },
  { title: 'Almoço', category: 'Alimentação', low: 2_400, high: 5_600, odds: 0.55 },
  { title: 'Café', category: 'Alimentação', low: 900, high: 2_200, odds: 0.4 },
  { title: 'Uber', category: 'Transporte', low: 1_400, high: 4_900, odds: 0.35 },
  { title: 'Farmácia', category: 'Saúde', low: 2_100, high: 8_700, odds: 0.12 },
  { title: 'Cinema', category: 'Lazer', low: 3_400, high: 9_600, odds: 0.08 },
  { title: 'Combustível', category: 'Transporte', low: 12_000, high: 22_000, odds: 0.09 },
];

export interface SampleLedger {
  accounts: Account[];
  series: Series[];
  entries: Entry[];
}

export function sampleMonth(today: Date = new Date()): SampleLedger {
  let n = 0;
  const id = (prefix: string) => `${prefix}-${(n++).toString(36)}`;

  const accounts: Account[] = [
    {
      id: ACCOUNT,
      name: 'Conta corrente',
      kind: 'checking',
      openingCents: 0,
      closingDay: null,
      dueDay: null,
      limitCents: null,
    },
    // A card is a line of credit, not money. It holds nothing, and the balance never counts it.
    // Closes on the 28th and falls due on the 10th of the month after — the ordinary Brazilian
    // shape, where the due day is numerically *before* the closing day.
    {
      id: CARD,
      name: 'Nubank',
      kind: 'card',
      openingCents: 0,
      closingDay: 28,
      dueDay: 10,
      limitCents: 800_000,
    },
  ];

  const series: Series[] = RECURRING.map((r) => ({
    id: id('ser'),
    kind: r.kind,
    title: r.title,
    category: r.category,
    accountId: ACCOUNT,
    amountCents: r.cents,
    direction: r.direction,
    dayOfMonth: r.on,
    // Debts started far enough back that some installments are already paid.
    startDate: day(startOfMonth(subMonths(today, r.paid ?? 14))),
    endDate: null,
    totalCount: r.total ?? null,
    paidCount: r.paid ?? 0,
    counterparty: null,
    linkedShareToken: null,
  }));

  const byTitle = new Map(series.map((s) => [s.title, s.id]));
  const entries: Entry[] = [];
  const random = rng(0x0770);

  // Two full months back, so a rolling 30-day window always has a complete month in it — even on the
  // second of a month, which is exactly when a month-to-date chart says nothing.
  const first = startOfMonth(subMonths(today, 2));

  // Whatever the owner was already holding when the window opens. Backdated one day before the first
  // generated entry so it never lands inside a chart's range and skews a category.
  entries.push({
    id: id('ent'),
    seriesId: null,
    settlesDate: null,
    recordedAt: null,
    date: day(subDays(first, 1)),
    amountCents: 412_000,
    direction: 'in',
    title: 'Saldo inicial',
    category: 'Renda',
    accountId: ACCOUNT,
  });

  for (let cursor = first; cursor <= today; cursor = addDays(cursor, 1)) {
    const date = day(cursor);
    const dom = cursor.getDate();
    const lastDay = getDaysInMonth(cursor);

    // Fixed bills that have already come due are facts, not forecasts.
    for (const r of RECURRING) {
      if (Math.min(r.on, lastDay) !== dom) continue;
      entries.push({
        id: id('ent'),
        seriesId: byTitle.get(r.title) ?? null,
        // The seed pays every fixed bill on the day it falls, so the occurrence it settles is the
        // one dated the same day. A settlement with no scheduled date would leave the projection
        // free to bill it again.
        settlesDate: byTitle.has(r.title) ? date : null,
        recordedAt: null,
        date,
        amountCents: r.cents,
        direction: r.direction,
        title: r.title,
        category: r.category,
        accountId: ACCOUNT,
      });
    }

    for (const v of VARIABLE) {
      if (random() > v.odds) continue;
      /*
       * Some of it goes on the card, which is how most of a Brazilian month is actually spent.
       *
       * It changes nothing about the balance — a card holds no money, so `balanceToday` and the
       * curve skip it either way — and everything about spend: the purchase is spend on its own
       * category the day it is made, while the statement that settles it a month later is a
       * transfer. Before this the seed had no card purchases at all, so counting the statement as
       * spend happened to be right; with them it would report the same grocery run twice.
       */
      const onCard = random() < 0.45;
      entries.push({
        id: id('ent'),
        seriesId: null,
        settlesDate: null,
        recordedAt: null,
        date,
        amountCents: Math.round(v.low + random() * (v.high - v.low)),
        direction: 'out',
        title: v.title,
        category: v.category,
        accountId: onCard ? CARD : ACCOUNT,
      });
    }
  }

  return { accounts, series, entries };
}
