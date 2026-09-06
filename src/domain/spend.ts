import type { Entry, Series } from './model';

/**
 * What counts as spend.
 *
 * Money leaving a checking account and money being spent are not the same event, and a card is where
 * they come apart. A purchase on a card is spend the day it happens, on the category it belongs to,
 * and it moves no balance. The statement that pays for it a month later moves the balance and is not
 * spend — it is the same money crossing from one place to another.
 *
 * Counting both would report a grocery run twice: once as `Mercado` when it was bought, and again as
 * `Cartão` when the bill was paid. That is precisely the class of quietly wrong number this project
 * was written against, and until now it was avoided only by accident — card purchases did not exist,
 * so the statement payment *was* the whole of that money and counting it was correct.
 *
 * So the rule, stated once and enforced by the type system: **a settlement of a `card` series is a
 * transfer, not spend.** Everything else that leaves is spend, wherever it was booked.
 */

/**
 * The series whose settlements are transfers.
 *
 * Derived from `kind` rather than from a category name. "Cartão" is a word the owner is free to
 * rename, reuse, or type on an ordinary bill; `kind: 'card'` is a fact about the model.
 */
export function paymentSeries(series: Series[]): Set<string> {
  return new Set(series.filter((s) => s.kind === 'card').map((s) => s.id));
}

/** True when this entry is money spent, as opposed to money moved. */
export function isSpend(e: Entry, payments: Set<string>): boolean {
  if (e.direction !== 'out') return false;
  return e.seriesId === null || !payments.has(e.seriesId);
}
