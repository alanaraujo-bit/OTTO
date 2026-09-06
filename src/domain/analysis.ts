import { addMonths, endOfMonth, getDaysInMonth, startOfMonth } from 'date-fns';
import { dayKey, parseDay } from './projection';
import type { Entry, Series } from './model';
import type { Cents } from './money';
import { isSpend, paymentSeries } from './spend';

/**
 * "Isso é normal?"
 *
 * The home screen answers *where do I stand* and the ledger answers *what*. The only question left
 * is whether any of it is unusual, and that one cannot be answered by a number on its own — R$ 1.200
 * on groceries means nothing until it is put next to the R$ 900 the owner usually spends. So every
 * figure here is a comparison, and the thing being compared against is always the owner themselves.
 *
 * **The rule this whole module is built on: compare the same day of the month.** Reading a month
 * that is two days old against months that are thirty days old is the exact class of quietly wrong
 * number PRODUCT.md was written against — it would announce a triumphant saving on the 2nd of every
 * month, forever. Spend through day N is compared to spend through day N of the months before it,
 * and nothing else.
 *
 * **What "usual" includes: everything that went out.** Fixed commitments — a debt installment, a
 * subscription — are in both sides of the comparison, so they cancel in the delta: the number the
 * owner reads is already about the part they control, without the module having to guess which
 * categories are discretionary. Guessing that would be a second, unverifiable model of the owner's
 * life living next to the ledger.
 */

/** Below this there is no median worth stating, and the screen must say so rather than draw one. */
export const MIN_BASIS = 2;

export interface MonthSpend {
  /** `yyyy-MM`. */
  month: string;
  from: string;
  to: string;
  /** Everything that went out across the whole month. */
  cents: Cents;
  /** Everything that went out from day 1 through the read day, clamped to this month's length. */
  toDate: Cents;
  /** The month has fully elapsed. */
  complete: boolean;
  /**
   * The ledger covers the whole of it: the first entry falls on this month's first day or earlier.
   *
   * A month whose opening days predate the first entry is not a frugal month — it is a month the
   * ledger did not see. Letting one into the median would drag it toward zero and tell the owner
   * they are overspending against a past that never happened.
   *
   * That deliberately discards the month the ledger was started in, unless it was started on the
   * 1st. Those opening days are unknowable — nothing distinguishes "spent nothing" from "was not
   * recording yet" — and a comparison built on an unknowable is worse than one month less of
   * history.
   */
  covered: boolean;
}

/** Total spent in `[from, to]`. Money coming in is not spend, and neither is paying a statement. */
function outflow(entries: Entry[], from: string, to: string, payments: Set<string>): Cents {
  let total = 0;
  for (const e of entries) {
    if (!isSpend(e, payments) || e.date < from || e.date > to) continue;
    total += e.amountCents;
  }
  return total;
}

/**
 * Spend per month over the trailing window, oldest first, ending with the month `today` is in.
 *
 * `readDay` is clamped to each month's own length. Without that, a reading taken on the 31st would
 * compare against February through the 31st — a window that does not exist — and February would come
 * back looking like the thriftiest month of the owner's life.
 */
export function monthlySpend(
  entries: Entry[],
  series: Series[],
  today: string,
  months = 6,
  readDay?: number,
): MonthSpend[] {
  const t = parseDay(today);
  const day = readDay ?? t.getDate();
  const payments = paymentSeries(series);

  const first = entries.reduce<string | null>(
    (min, e) => (min === null || e.date < min ? e.date : min),
    null,
  );

  const out: MonthSpend[] = [];
  for (let back = months; back >= 0; back--) {
    const m = startOfMonth(addMonths(t, -back));
    const from = dayKey(m);
    const to = dayKey(endOfMonth(m));
    const through = dayKey(new Date(m.getFullYear(), m.getMonth(), Math.min(day, getDaysInMonth(m))));

    out.push({
      month: from.slice(0, 7),
      from,
      to,
      cents: outflow(entries, from, to, payments),
      toDate: outflow(entries, from, through, payments),
      complete: to < today,
      covered: first !== null && from >= first,
    });
  }
  return out;
}

/** The middle value. Even counts average the two straddling it, so two months still give a figure. */
export function median(values: Cents[]): Cents | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const hi = s[mid] as Cents;
  return s.length % 2 === 1 ? hi : Math.round(((s[mid - 1] as Cents) + hi) / 2);
}

export interface Pace {
  /** The day of the current month this reading is taken at. */
  day: number;
  /** Spend so far this month, through `day`. */
  spent: Cents;
  /** The median of the same window across comparable months. Null when there are too few. */
  usual: Cents | null;
  /** `spent - usual`. Positive is over. Null when there is nothing to compare against. */
  delta: Cents | null;
  /** How many months the median came from. */
  basis: number;
  /** The window, oldest first, current month last. */
  history: MonthSpend[];
}

/** Where this month stands against the same stretch of the months before it. */
export function spendPace(entries: Entry[], series: Series[], today: string, months = 6): Pace {
  const history = monthlySpend(entries, series, today, months);
  // The walk always ends at the month containing `today`, so this row exists by construction.
  const current = history[history.length - 1] as MonthSpend;
  const past = history.slice(0, -1).filter((m) => m.covered && m.complete);

  const usual = past.length >= MIN_BASIS ? median(past.map((m) => m.toDate)) : null;

  return {
    day: parseDay(today).getDate(),
    spent: current.toDate,
    usual,
    delta: usual === null ? null : current.toDate - usual,
    basis: past.length,
    history,
  };
}

export interface CategoryPace {
  category: string;
  /** Spent in this category so far this month. */
  cents: Cents;
  /** The median for the same stretch of comparable months. Null when there are too few. */
  usual: Cents | null;
  delta: Cents | null;
}

/**
 * The same reading, per category.
 *
 * A category the owner spent nothing on in a comparable month counts as **zero**, not as absent —
 * unlike an uncovered month. Not buying anything in a category is a real fact about that month; a
 * month the ledger never saw is not.
 */
export function categoryPace(
  entries: Entry[],
  series: Series[],
  today: string,
  months = 6,
): CategoryPace[] {
  const payments = paymentSeries(series);
  const history = monthlySpend(entries, series, today, months);
  const current = history[history.length - 1] as MonthSpend;
  const past = history.slice(0, -1).filter((m) => m.covered && m.complete);
  const enough = past.length >= MIN_BASIS;

  const t = parseDay(today);
  const day = t.getDate();

  const now = new Map<string, Cents>();
  for (const e of entries) {
    if (!isSpend(e, payments) || e.date < current.from || e.date > dayKeyThrough(current, day))
      continue;
    now.set(e.category, (now.get(e.category) ?? 0) + e.amountCents);
  }

  // Every category the owner has ever used in the window, so one that stopped still shows as a drop.
  const names = new Set(now.keys());
  const perMonth = past.map((m) => {
    const bucket = new Map<string, Cents>();
    for (const e of entries) {
      if (!isSpend(e, payments) || e.date < m.from || e.date > dayKeyThrough(m, day)) continue;
      bucket.set(e.category, (bucket.get(e.category) ?? 0) + e.amountCents);
      names.add(e.category);
    }
    return bucket;
  });

  return [...names]
    .map((category) => {
      const cents = now.get(category) ?? 0;
      const usual = enough ? median(perMonth.map((b) => b.get(category) ?? 0)) : null;
      return { category, cents, usual, delta: usual === null ? null : cents - usual };
    })
    .filter((c) => c.cents > 0 || (c.usual ?? 0) > 0)
    .sort((a, b) => b.cents - a.cents);
}

/** The read day inside one month, clamped to that month's length. */
function dayKeyThrough(m: MonthSpend, day: number): string {
  const d = parseDay(m.from);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), Math.min(day, getDaysInMonth(d))));
}
