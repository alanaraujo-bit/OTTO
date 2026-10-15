import { addDays } from 'date-fns';
import { dayKey, parseDay } from './projection';
import type { Entry } from './model';
import type { Cents } from './money';
import { isSpend } from './spend';

/**
 * How a month's spending falls across the week, and which movements made it up.
 *
 * Both readings are over a window of days the caller chooses, and both count only what is spend —
 * a card statement paid is a transfer, not a purchase (see `spend.ts`), so it never appears here.
 */

/** Monday first: the order a Brazilian week is read in. `getDay()` numbers Sunday as 0. */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;
const NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export interface WeekdayRhythm {
  label: string;
  weekday: number;
  /** Spend on this weekday across the window, divided by how many of those weekdays it holds. */
  cents: Cents;
  /** How many of this weekday fall inside the window. Zero means the window never reached one. */
  days: number;
}

/**
 * Average spend per day, by weekday.
 *
 * An average rather than a total on purpose: a window that holds five Mondays and four Tuesdays would
 * otherwise rank Monday first for no reason but the calendar. Dividing by how many of each weekday the
 * window contains is what makes the seven rows comparable.
 */
export function weekdayRhythm(
  entries: Entry[],
  payments: Set<string>,
  from: string,
  to: string,
): WeekdayRhythm[] {
  const total = new Map<number, Cents>();
  for (const e of entries) {
    if (!isSpend(e, payments) || e.date < from || e.date > to) continue;
    const w = parseDay(e.date).getDay();
    total.set(w, (total.get(w) ?? 0) + e.amountCents);
  }

  const days = new Map<number, number>();
  for (let d = parseDay(from); dayKey(d) <= to; d = addDays(d, 1)) {
    const w = d.getDay();
    days.set(w, (days.get(w) ?? 0) + 1);
  }

  return MONDAY_FIRST.map((w) => {
    const n = days.get(w) ?? 0;
    return {
      label: NAMES[w] as string,
      weekday: w,
      days: n,
      cents: n === 0 ? 0 : Math.round((total.get(w) ?? 0) / n),
    };
  });
}

/** The largest purchases in a window, biggest first. Each one is a real entry, so each can be opened. */
export function largestSpends(
  entries: Entry[],
  payments: Set<string>,
  from: string,
  to: string,
  count = 5,
): Entry[] {
  return entries
    .filter((e) => isSpend(e, payments) && e.date >= from && e.date <= to)
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, count);
}
