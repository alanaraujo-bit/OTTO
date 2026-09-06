import { getDaysInMonth } from 'date-fns';
import { dayKey, parseDay, spendByCategory } from './projection';
import { isSpend, paymentSeries } from './spend';
import type { Entry, Series } from './model';
import type { Cents } from './money';

/**
 * A ceiling the owner sets on a category, and what the month is doing to it.
 *
 * "Quero gastar só R$ 300 com alimentação." The cap itself is trivial — a category and a figure.
 * Everything worth building is the second half of that sentence: *avisa quando estiver perto*.
 *
 * **"Perto" is not a percentage.** R$ 240 of R$ 300 on the 5th is a disaster and on the 28th is a
 * good month, and a rule that fires at 80% cannot tell those apart — it would shout in the second
 * case and stay silent in the first, which is exactly backwards. So what this module produces is a
 * *pace*: at the rate the month is actually going, does the cap survive to the end of it, and if
 * not, on which day does it break. That figure is the one the owner cannot work out in their head,
 * and it is the only thing here worth interrupting somebody for.
 *
 * Spend means what `spend.ts` says it means, so a purchase on a card counts on the day it was made
 * rather than on the day the statement is paid. That also settles the calendar question the cap
 * would otherwise raise: the window is the plain month, because a cap is about spending and
 * spending has already been defined as the day of purchase, not the day the money leaves.
 */

/** The ceiling itself. Storage is the ledger document, alongside accounts, series and entries. */
export interface Cap {
  category: string;
  /** Always positive. A cap of zero would be a category the owner may not use, which is not a cap. */
  capCents: Cents;
}

export interface CapReading {
  category: string;
  capCents: Cents;
  /** Spent in this category, this month, up to and including today. */
  spent: Cents;
  /** What is left of the ceiling. Negative once it is through. */
  leftCents: Cents;
  /** Fraction of the ceiling used. Above 1 when it is through. */
  used: number;
  /** Days of the month still to come, counting today. Never zero. */
  daysLeft: number;
  /** Where the month lands if the rate so far holds to the end of it. */
  projectedCents: Cents;
  /**
   * The day the ceiling breaks at the current rate, or null when it survives the month.
   *
   * A day already past means it is broken now, and the day is the one it happened on.
   */
  burstsOn: string | null;
  /** What is still spendable per remaining day without going through. Zero once it is through. */
  perDayCents: Cents;
}

/** How the month reads against one ceiling. */
export function capReading(
  cap: Cap,
  entries: Entry[],
  series: Series[],
  today: string,
): CapReading {
  const t = parseDay(today);
  const days = getDaysInMonth(t);
  const day = t.getDate();
  const from = dayKey(new Date(t.getFullYear(), t.getMonth(), 1));

  const spent =
    spendByCategory(entries, from, today, paymentSeries(series)).find(
      (c) => c.category === cap.category,
    )?.cents ?? 0;

  const leftCents = cap.capCents - spent;
  const daysLeft = days - day + 1;

  /*
   * The rate, measured over the days that have actually happened.
   *
   * Dividing by the whole month would flatter every reading before the 15th and panic after it. The
   * elapsed portion is the only stretch there is evidence for, so it is the only stretch the rate is
   * taken from.
   */
  const perElapsedDay = spent / day;
  const projectedCents = Math.round(perElapsedDay * days);

  /*
   * The day the ceiling breaks.
   *
   * Solved from the rate rather than walked day by day, and clamped into the month: a rate so slow
   * that it breaks in March says nothing about this month, and is reported as null instead.
   */
  let burstsOn: string | null = null;
  if (spent >= cap.capCents) {
    burstsOn = crossedOn(cap, entries, series, from, today);
  } else if (perElapsedDay > 0) {
    const at = Math.ceil(cap.capCents / perElapsedDay);
    if (at <= days) burstsOn = dayKey(new Date(t.getFullYear(), t.getMonth(), at));
  }

  return {
    category: cap.category,
    capCents: cap.capCents,
    spent,
    leftCents,
    used: cap.capCents === 0 ? 0 : spent / cap.capCents,
    daysLeft,
    projectedCents,
    burstsOn,
    perDayCents: leftCents <= 0 ? 0 : Math.floor(leftCents / daysLeft),
  };
}

/**
 * The day a ceiling already through was actually crossed.
 *
 * Read from the entries rather than from the rate, because this one is a fact and the projection is
 * not: once it has happened, there is a real day the running total went past the figure, and
 * reporting a modelled one instead would be inventing a date the ledger can contradict.
 */
function crossedOn(
  cap: Cap,
  entries: Entry[],
  series: Series[],
  from: string,
  today: string,
): string {
  const payments = paymentSeries(series);
  const byDay = new Map<string, Cents>();
  for (const e of entries) {
    if (e.category !== cap.category || e.date < from || e.date > today) continue;
    if (!isSpend(e, payments)) continue;
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amountCents);
  }
  let running = 0;
  for (const date of [...byDay.keys()].sort()) {
    running += byDay.get(date) as Cents;
    if (running >= cap.capCents) return date;
  }
  return today;
}

/**
 * Every ceiling, read, worst first.
 *
 * "Worst" is how much of the ceiling is gone, not how many reais — a R$ 300 cap at 95% matters more
 * than a R$ 2.000 one at 30%, and the whole point of setting a figure is that it, and not the size
 * of it, is the thing being measured against.
 */
export function capReadings(
  caps: Cap[],
  entries: Entry[],
  series: Series[],
  today: string,
): CapReading[] {
  return caps
    .map((cap) => capReading(cap, entries, series, today))
    .sort((a, b) => b.used - a.used);
}
