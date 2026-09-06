import { addMonths, differenceInCalendarDays, getDaysInMonth, startOfMonth } from 'date-fns';
import { dayKey, parseDay } from './projection';
import type { Account, Entry } from './model';
import type { Cents } from './money';

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
