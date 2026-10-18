import { addDays, addMonths, differenceInCalendarDays, format, getDaysInMonth, parseISO, startOfMonth } from 'date-fns';
import { isStatementSeries, statementSeriesId } from './settlement';
import type { Account, Entry, Series } from './model';
import type { Cents } from './money';

// Local rather than imported from `projection`: projection reads the statements this file forecasts,
// and a module cycle between the two would hang on whichever loaded first.
const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const parseDay = (s: string) => parseISO(s);

/**
 * The card cycle.
 *
 * A card differs from an account in exactly one way that matters: it has a date on which it becomes
 * real money. It closes, and then it falls due, and between those two the amount stops moving. That
 * is the whole reading this module exists to produce — *how much, and when* — and it is the same
 * solid/dashed grammar the rest of the app already speaks: an open statement is still forecast, a
 * closed one is fact.
 *
 * **The due day is normally numerically before the closing day.** A Brazilian card that closes on
 * the 28th falls due on the 10th — of the following month. Treating `dueDay < closingDay` as an edge
 * case would get the ordinary card wrong, so the rule is stated the other way round: the due date is
 * in the closing month when it is strictly after the closing day, and in the month after otherwise.
 *
 * Both days are clamped to each month's length, the same rule `occurrences()` applies. A card
 * closing on the 31st still closes in February.
 */

export interface Statement {
  /** The day this statement closes. */
  closes: string;
  /** The day it must be paid. */
  due: string;
  /** Closed and waiting to be paid: the amount is fact, not still moving. */
  closed: boolean;
  /** The purchases it covers: the day after the previous close, through the close. */
  from: string;
  to: string;
  /** Negative once it has closed. */
  daysToClose: number;
  daysToDue: number;
}

/** Day `day` inside the month `m`, clamped to that month's length. */
function on(m: Date, day: number): Date {
  return new Date(m.getFullYear(), m.getMonth(), Math.min(day, getDaysInMonth(m)));
}

/**
 * The statement the owner is currently living with: the next one to fall due.
 *
 * Before the close that is the one still accumulating; between close and due it is the one that has
 * closed and is waiting to be paid. One reading either way, which is what makes it drawable as a
 * single rule rather than as two competing figures.
 *
 * Null when the card has no cycle configured. Nothing here guesses one.
 */
export function statementCycle(card: Account, today: string): Statement | null {
  if (card.kind !== 'card' || card.closingDay == null || card.dueDay == null) return null;

  const t = parseDay(today);
  const closingDay = card.closingDay;
  const dueDay = card.dueDay;

  for (let back = 2; back >= -2; back--) {
    const month = startOfMonth(addMonths(t, -back));
    const closes = on(month, closingDay);
    /*
     * Which month the due date lands in is decided on the *clamped* dates, not on the raw day
     * numbers. Comparing `dueDay > closingDay` looks equivalent and is not: a card closing on the
     * 30th and due on the 31st has `31 > 30`, so it would be filed in the closing month — and in
     * September both days clamp to the 30th, making the statement fall due the instant it closed.
     * February collapses the same way for any pair above the 28th. Clamp first, then compare.
     */
    const dueMonth = on(month, dueDay) > closes ? month : addMonths(month, 1);
    const due = on(dueMonth, dueDay);

    if (dayKey(due) < today) continue;

    const prevClose = on(startOfMonth(addMonths(month, -1)), closingDay);
    const from = dayKey(new Date(prevClose.getFullYear(), prevClose.getMonth(), prevClose.getDate() + 1));

    return {
      closes: dayKey(closes),
      due: dayKey(due),
      closed: today > dayKey(closes),
      from,
      to: dayKey(closes),
      daysToClose: differenceInCalendarDays(closes, t),
      daysToDue: differenceInCalendarDays(due, t),
    };
  }

  return null;
}

/**
 * What has been charged to this card inside the statement window.
 *
 * Only entries booked against the card itself. This is deliberately not the `series` of kind `card`
 * that the ledger also holds: that series is the *payment* leaving the checking account, which is a
 * different event on a different account, and adding the two would count one purchase twice.
 *
 * **A credit on the card reduces the statement.** A refund is money coming back on the same line the
 * purchase went out on, and a statement that ignored it would ask the owner to pay for something
 * they returned. It is netted here rather than dropped, which is also why the total can be negative:
 * a month with more refunds than purchases really does owe nothing, and says so.
 */
export function statementTotal(entries: Entry[], card: Account, s: Statement): Cents {
  let total = 0;
  for (const e of entries) {
    if (e.accountId !== card.id) continue;
    if (e.date < s.from || e.date > s.to) continue;
    total += e.direction === 'out' ? e.amountCents : -e.amountCents;
  }
  return total;
}

/**
 * How much of the line is used, 0..1, or null when there is no line to divide by.
 *
 * Uncapped rather than clamped: a card over its limit is a fact the owner needs, and a bar that
 * stops at full would hide the one case where the number matters most. The caller decides how to
 * draw past 1.
 */
export function limitUse(used: Cents, card: Account): number | null {
  if (card.limitCents == null || card.limitCents <= 0) return null;
  return used / card.limitCents;
}

/**
 * What is on this statement, newest first.
 *
 * The statement figure says how much; this says what — the same split the ledger screen makes
 * between the curve and the names, at the scale of one card.
 */
export function statementItems(entries: Entry[], card: Account, s: Statement): Entry[] {
  return entries
    .filter((e) => e.accountId === card.id && e.date >= s.from && e.date <= s.to)
    .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
}

/**
 * How many statements ahead are read per card. A year and a month: the farthest any screen projects
 * (the razão's six months, the assistant's 400-day window) never reaches past it.
 */
const STATEMENTS_AHEAD = 13;

/** The category a projected statement is filed under — the seed one `domain/category` dresses as a card. */
export const STATEMENT_CATEGORY = 'Cartão';

/**
 * Each card's statements that are still to be paid, as rules the projection engine can read.
 *
 * The forecast only knew series, and a statement is not one — so the one bill every card holder
 * pays every month was missing from every "a pagar" figure, and the checking balance sailed through
 * the due date untouched. This closes that by saying each statement in the only shape the engine,
 * and every screen built on it, already speaks: a one-shot rule, `startDate = endDate = due`, so
 * `occurrences()` emits it exactly once, on the day it falls due, and the curve, the razão, the
 * calendar, the alerts and the assistant all pick it up without learning anything new.
 *
 * **The amount is the statement, less what has been paid against it.** The statement is
 * `statementTotal` over its cycle — the open cycle grows with every purchase booked on the card, a
 * closed one has stopped moving. A payment is an entry carrying `statementSeriesId(card)` with the
 * statement's due month in `settlesDate`; whatever has been paid is netted out, so a partial payment
 * leaves the remainder projected and a full one leaves nothing. A cycle with nothing to pay — no
 * purchases, or refunds that cancel them — projects nothing.
 *
 * Matched by the **month** of the due date rather than the day, the rule `Deferral` follows for the
 * same reason: a card has one statement per due month, and the owner correcting the due day from
 * the 10th to the 12th must not hand a paid statement back to the forecast.
 *
 * **Only statements due today or later.** One whose day has passed is not carried as overdue, and
 * that is a choice, not an oversight: every statement before this existed was paid, if at all, by an
 * ordinary lançamento that links to nothing, and OTTO has no honest way to tell those apart from a
 * statement never paid — guessing by category or description is exactly what `spend.ts` rules out.
 * Projecting them would put months of paid bills back on the owner as "vencido". The cost: a
 * statement genuinely missed drops off the forecast the day after it was due.
 *
 * **Booked against the account that pays it.** A statement moves money on the account it is paid
 * from, never on the card — the purchases already sit there — so the rule has to name a conta for
 * the curve to count it and for "paguei" to land somewhere. That is the account the last payment of
 * this card came from; before there is one, the first conta corrente in the ledger, then any conta
 * that holds money. It is a default the keypad shows and the owner can change, not a fact. A ledger
 * with no conta at all has nowhere to pay from and projects nothing.
 */
export function statementForecast(accounts: Account[], entries: Entry[], today: string): Series[] {
  const holding = accounts.filter((a) => a.kind !== 'card');
  const fallback = holding.find((a) => a.kind === 'checking') ?? holding[0];
  if (!fallback) return [];

  const out: Series[] = [];
  for (const card of accounts) {
    let s = statementCycle(card, today);
    if (!s) continue;

    const id = statementSeriesId(card.id);
    const charges = entries.filter((e) => e.accountId === card.id);
    const payments = entries.filter((e) => e.seriesId === id);
    // Nothing is ever booked past the newest charge, so a cycle opening after it is empty and so is
    // every one after that.
    const lastCharge = charges.reduce((max, e) => (e.date > max ? e.date : max), '');
    const lastPayment = payments.reduce<Entry | null>((a, e) => (a === null || e.date >= a.date ? e : a), null);
    const payer = holding.find((a) => a.id === lastPayment?.accountId) ?? fallback;

    for (let n = 0; s && n < STATEMENTS_AHEAD && s.from <= lastCharge; n++) {
      const due = s.due;
      const paid = payments
        .filter((e) => (e.settlesDate ?? e.date).slice(0, 7) === due.slice(0, 7))
        .reduce((sum, e) => sum + (e.direction === 'out' ? e.amountCents : -e.amountCents), 0);
      const left = statementTotal(charges, card, s) - paid;
      if (left > 0) {
        out.push({
          id,
          kind: 'card',
          title: `Fatura ${card.name}`,
          category: STATEMENT_CATEGORY,
          accountId: payer.id,
          amountCents: left,
          direction: 'out',
          dayOfMonth: parseDay(due).getDate(),
          startDate: due,
          endDate: due,
          totalCount: null,
          paidCount: 0,
          counterparty: null,
          linkedShareToken: null,
        });
      }
      s = statementCycle(card, dayKey(addDays(parseDay(due), 1)));
    }
  }
  return out;
}

/**
 * The rules the forecast reads: the ledger's own, plus each card's statements still to be paid.
 *
 * Idempotent — any statement row already in `series` is dropped before the forecast's are added —
 * so a screen that passes the result into `monthCurve`, which applies this itself, cannot count a
 * statement twice. Dropping the stored row also matters on its own: that row only anchors payments
 * (see `statementSeriesId`) and has no amount of its own to project.
 *
 * Pass this, not `series`, to every function that projects — `project`, `dayItems`, `upcoming`,
 * `overdue`, `calendarDays`. Not to `commitments`: a statement is not a commitment the owner set,
 * and its amount is not a monthly cost.
 */
export function withStatements(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
): Series[] {
  return [
    ...series.filter((s) => !isStatementSeries(s.id)),
    ...statementForecast(accounts, entries, today),
  ];
}

/**
 * The series row a card's payments point at, written the first time one of its statements is paid.
 *
 * Booked against the card itself, so that it moves no balance and nothing reading the stored rules
 * — including an older build of this app — projects money from it; its amount is zero for the same
 * reason. Everything a statement actually is comes from `statementForecast`.
 */
export function statementAnchor(card: Account, since: string): Series {
  return {
    id: statementSeriesId(card.id),
    kind: 'card',
    title: `Fatura ${card.name}`,
    category: STATEMENT_CATEGORY,
    accountId: card.id,
    amountCents: 0,
    direction: 'out',
    dayOfMonth: card.dueDay ?? parseDay(since).getDate(),
    startDate: since,
    endDate: null,
    totalCount: null,
    paidCount: 0,
    counterparty: null,
    linkedShareToken: null,
  };
}

/**
 * The ledger document with one statement payment added — the change `settleOccurrence` writes.
 *
 * Pure and here, rather than inline in the repository, so the round trip is checked in plain Node:
 * the document this returns is the one the server validates (`tools/ledger-check.mjs` runs it
 * through the server's own validator).
 *
 * Idempotent by the entry's id, not by the statement: a second payment of one statement is the rest
 * of a partial one, a real thing to record, while the same entry arriving twice is a retry of a lost
 * answer (see `change` in `repo.ts`). The anchor row is added with the card's first payment and
 * found there by every later one.
 */
export function payStatement<L extends { accounts: Account[]; series: Series[]; entries: Entry[] }>(
  ledger: L,
  seriesId: string,
  scheduled: string,
  entry: Entry,
): L {
  if (ledger.entries.some((item) => item.id === entry.id)) return ledger;
  const card = ledger.accounts.find((a) => a.kind === 'card' && statementSeriesId(a.id) === seriesId);
  if (!card) throw new Error('Esse cartão não existe mais.');
  // Paid from a card, the money would move nowhere the balance can see and the statement would
  // still read as paid — a bill retired by a number that left no account.
  const payer = ledger.accounts.find((a) => a.id === entry.accountId);
  if (!payer || payer.kind === 'card') throw new Error('A fatura se paga de uma conta, não de um cartão.');
  return {
    ...ledger,
    series: ledger.series.some((item) => item.id === seriesId)
      ? ledger.series
      : [...ledger.series, statementAnchor(card, scheduled)],
    entries: [...ledger.entries, { ...entry, seriesId, settlesDate: scheduled }],
  };
}
