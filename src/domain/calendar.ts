import { addDays } from 'date-fns';
import { signed, type Deferral, type Direction, type Entry, type Series, type SeriesKind } from './model';
import { dayKey, parseDay, project } from './projection';
import { keyOf, settled } from './settlement';

/*
 * The calendar's reading of a month, kept out of the screen so the arithmetic in it — above all
 * what a day's total is allowed to include — is checked by `tools/ledger-check.mjs` like every
 * other number the owner reads.
 */

export type DayState = 'settled' | 'forecast' | 'pending';

export type CalendarItem = {
  key: string;
  title: string;
  category: string;
  amountCents: number;
  direction: Direction;
  state: DayState;
  kind: SeriesKind | 'entry';
  installment: { n: number; of: number } | null;
  /** The hour the owner gave this lançamento. Null on every projection — nothing has an hour until
      it has happened. */
  time: string | null;
  /** The rule behind the row, when there is one — where a forecast or a late row opens. */
  seriesId: string | null;
  /** The day a forecast is identified by — what settling it from here names. Null on an entry. */
  scheduled: string | null;
  /** The lançamento behind the row, when it is one — where a recorded row opens. */
  entryId: string | null;
};

export type CalendarDay = {
  date: string;
  items: CalendarItem[];
  moved: number;
  pending: boolean;
};

/**
 * A month is a map before it is a grid: every day has one truthful, named reading.
 *
 * `series` is the forecast's set — pass `withStatements(...)`, or a card's statement is missing from
 * the day it falls due.
 */
export function calendarDays(
  entries: Entry[],
  series: Series[],
  from: string,
  to: string,
  today: string,
  deferrals: Map<string, Deferral>,
): Map<string, CalendarDay> {
  const byDate = new Map<string, CalendarItem[]>();
  const put = (date: string, item: CalendarItem) => {
    const existing = byDate.get(date);
    if (existing) existing.push(item);
    else byDate.set(date, [item]);
  };

  const done = settled(entries);

  for (const entry of entries) {
    if (entry.date < from || entry.date > to) continue;
    const rule = entry.seriesId ? series.find((item) => item.id === entry.seriesId) : null;
    put(entry.date, {
      key: entry.id,
      title: entry.title,
      category: entry.category,
      amountCents: entry.amountCents,
      direction: entry.direction,
      state: 'settled',
      kind: rule?.kind ?? 'entry',
      installment: null,
      time: entry.time,
      seriesId: entry.seriesId ?? null,
      scheduled: null,
      entryId: entry.id,
    });
  }

  // `project` already drops anything an entry has settled, by the same key every other screen
  // uses. The check that used to live here compared `entry.date` to `occurrence.date`, which was
  // right only while nothing was ever paid early — and paying early is now a thing the app does.
  for (const occurrence of project(series, from, to, done, deferrals)) {
    /*
     * A projection is never claimed as fact, but a day that has passed with nothing settling it is
     * not a forecast either — it is still owed, and that is the state this calendar exists to make
     * visible.
     *
     * This used to admit only debts and silently drop every other kind, so a rent that went unpaid
     * left no mark anywhere. Every kind is admitted now, inflows included: a salary that did not
     * arrive is not a debt, but it is a promise the month is still counting on.
     *
     * The dashboard's overdue feed stops at the start of the current month, deliberately — see
     * `overdue`. This does not, and the difference is not an inconsistency: that feed is a list of
     * things to act on now, while this is a month the owner navigated to on purpose. Its window is
     * the month on screen, so "what was still open in July" stays answerable without any list
     * growing without bound.
     */
    put(occurrence.on, {
      key: keyOf(occurrence),
      title: occurrence.title,
      category: occurrence.category,
      amountCents: occurrence.amountCents,
      direction: occurrence.direction,
      state: occurrence.on <= today ? 'pending' : 'forecast',
      kind: occurrence.kind,
      installment: occurrence.installment,
      time: null,
      seriesId: occurrence.seriesId,
      scheduled: occurrence.date,
      entryId: null,
    });
  }

  const out = new Map<string, CalendarDay>();
  for (let cursor = parseDay(from); cursor <= parseDay(to); cursor = addDays(cursor, 1)) {
    const date = dayKey(cursor);
    const items = (byDate.get(date) ?? []).sort((a, b) => b.amountCents - a.amountCents);
    out.set(date, {
      date,
      items,
      /*
       * What moved, not what was owed. A pending row is money that did not arrive or did not leave,
       * so it stays listed on its day and out of the day's total — the same rule the Home curve and
       * the razão apply to an overdue item (see `monthCurve`). Summing it here once painted 5 de
       * outubro green for R$ 1.270 when R$ 500 of that was a payment nobody had made.
       */
      moved: items.reduce(
        (sum, item) => (item.state === 'pending' ? sum : sum + signed(item.amountCents, item.direction)),
        0,
      ),
      pending: items.some((item) => item.state === 'pending'),
    });
  }
  return out;
}
