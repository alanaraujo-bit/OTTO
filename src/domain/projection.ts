import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
} from 'date-fns';
import {
  signed,
  type Account,
  type Direction,
  type Entry,
  type Occurrence,
  type Series,
} from './model';
import type { Cents } from './money';
import { keyOf, settled } from './settlement';
import { isSpend } from './spend';

/** Plain local-time day keys. Everything downstream compares these as strings. */
export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const parseDay = (s: string) => parseISO(s);

/**
 * Expand one series into the occurrences that fall inside `[from, to]`.
 *
 * A monthly series anchored to day 31 must still occur in February. Clamping to the month's length
 * is the rule everywhere — the alternative, skipping the month, silently loses a bill.
 */
export function occurrences(series: Series, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const fromD = parseDay(from);
  const toD = parseDay(to);
  const startD = parseDay(series.startDate);
  const endD = series.endDate ? parseDay(series.endDate) : null;

  // A debt stops when its installments run out, whatever its end date says.
  const remaining =
    series.kind === 'debt' && series.totalCount != null
      ? series.totalCount - series.paidCount
      : null;
  if (remaining != null && remaining <= 0) return out;

  // Walk months from the later of the range start and the series start.
  let cursor = startOfMonth(isBefore(fromD, startD) ? startD : fromD);
  const lastMonth = startOfMonth(toD);

  // How many installments have already elapsed before this cursor, so numbering stays correct
  // regardless of where the query window begins.
  let index = elapsedInstallments(series, cursor);

  while (!isAfter(cursor, lastMonth)) {
    const day = Math.min(series.dayOfMonth, getDaysInMonth(cursor));
    const when = new Date(cursor.getFullYear(), cursor.getMonth(), day);

    const insideWindow = !isBefore(when, fromD) && !isAfter(when, toD);
    const started = !isBefore(when, startD);
    const notEnded = endD == null || !isAfter(when, endD);
    const withinCount = remaining == null || index < (series.totalCount as number);

    if (started && notEnded && withinCount) {
      if (insideWindow) {
        out.push({
          seriesId: series.id,
          kind: series.kind,
          date: dayKey(when),
          title: series.title,
          category: series.category,
          amountCents: series.amountCents,
          direction: series.direction,
          accountId: series.accountId,
          installment:
            series.kind === 'debt' && series.totalCount != null
              ? { n: index + 1, of: series.totalCount }
              : null,
        });
      }
      index += 1;
    }

    cursor = addMonths(cursor, 1);
  }

  return out;
}

/**
 * How many of a debt's installments fall strictly before `before`.
 *
 * Takes only the three fields it reads, rather than a whole `Series`, so a shared link can number
 * its installments with this same function. The public payload is not a ledger and never will be —
 * it carries a start date and a count and no account — but the numbering a reader sees on the web
 * must be the numbering the owner sees in the app, and the only way to guarantee that is for both
 * to come from here.
 */
export function elapsedInstallments(
  series: Pick<Series, 'kind' | 'totalCount' | 'startDate'>,
  before: Date,
): number {
  if (series.kind !== 'debt' || series.totalCount == null) return 0;
  const start = startOfMonth(parseDay(series.startDate));
  const months =
    (before.getFullYear() - start.getFullYear()) * 12 + (before.getMonth() - start.getMonth());
  return Math.max(0, Math.min(series.totalCount, months));
}

/**
 * Every occurrence of every series in the window that is still outstanding, ordered by date.
 *
 * `done` is required rather than defaulted for the same reason `spendByCategory` requires its
 * payment set: a default of "nothing has been settled" would make every future caller silently
 * double-count a bill the owner paid early, and the compiler is the only thing that reliably
 * remembers. Pass `settled(entries)`.
 *
 * `occurrences()` deliberately stays unfiltered underneath. `commitments.ts` calls it directly to
 * answer what a rule costs per year, and a salary drawn early is still that year's salary — netting
 * it out there would understate the rule rather than describe it.
 */
export function project(
  all: Series[],
  from: string,
  to: string,
  done: Set<string>,
): Occurrence[] {
  return all
    .flatMap((s) => occurrences(s, from, to))
    .filter((o) => !done.has(keyOf(o)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The next occurrence of `series` that nothing has settled yet, looking from the start of `today`'s
 * month forward.
 *
 * What "antecipar" needs to know: which occurrence an early payment retires. Anchored at the month
 * start rather than at `today`, because an owner paying the rent on the 7th when it was due on the
 * 3rd is settling that occurrence, not next month's — but never further back, so a settlement cannot
 * reach into a month already closed.
 *
 * Null when the series has nothing outstanding in the horizon — a debt that finished, a subscription
 * past its end date. The caller then records an ordinary entry, which is the honest reading: money
 * moved, and no rule accounts for it.
 */
export function nextOpen(
  series: Series,
  entries: Entry[],
  today: string,
  /** How far ahead to look for an unsettled occurrence, in months. */
  months = 13,
): Occurrence | null {
  const t = parseDay(today);
  const from = dayKey(startOfMonth(t));
  const to = dayKey(endOfMonth(addMonths(t, months - 1)));
  return project([series], from, to, settled(entries))[0] ?? null;
}

/**
 * Money the owner actually holds, right now.
 *
 * Card accounts are excluded on purpose: a credit line is not money. Counting it would inflate the
 * one number the whole screen is built to be trusted on.
 */
export function balanceToday(accounts: Account[], entries: Entry[], today: string): Cents {
  const holding = new Set(accounts.filter((a) => a.kind !== 'card').map((a) => a.id));
  const opening = accounts
    .filter((a) => holding.has(a.id))
    .reduce((sum, a) => sum + a.openingCents, 0);

  return entries
    .filter((e) => holding.has(e.accountId) && e.date <= today)
    .reduce((sum, e) => sum + signed(e.amountCents, e.direction), opening);
}

export interface CurvePoint {
  /** Day of month, 1-based. */
  day: number;
  date: string;
  balance: Cents;
  /** True for days that have already happened — the difference between record and forecast. */
  actual: boolean;
  /** Signed total that landed on this day. Zero on a quiet day. */
  moved: Cents;
}

export interface MonthCurve {
  points: CurvePoint[];
  /** Index of today inside `points`, or null when the month being read is not the current one. */
  todayIndex: number | null;
  /** Where the balance stands at the end of this month's elapsed portion. */
  balanceNow: Cents;
  /** Where the month closes if nothing changes. */
  balanceEnd: Cents;
  /** Where the month opened — the balance carried in on day 1. */
  balanceStart: Cents;
  /** Lowest point the month reaches from today forward — the number that decides if you are fine. */
  trough: CurvePoint;
  /** Total in and out across the whole month, actual plus projected. */
  inflow: Cents;
  outflow: Cents;
  /** The portion of each that has already happened. The rest is still forecast. */
  inflowDone: Cents;
  outflowDone: Cents;
  from: string;
  to: string;
  /** Where this month sits relative to today. Drives what the chart is allowed to claim. */
  era: 'past' | 'current' | 'future';
}

/**
 * The month as a single line: what the balance did, and what it does next.
 *
 * This is the screen's whole argument. One continuous series across one axis — the elapsed half
 * built from entries that really happened, the remaining half from projected occurrences — so
 * "where do I stand" and "where is this heading" are the same reading rather than two numbers the
 * owner has to reconcile in their head.
 *
 * Projected occurrences are ignored for days already past: whatever was supposed to happen then
 * either happened, and is an entry, or did not, and must not be invented.
 *
 * The month being read is a parameter, because the owner navigates time. That is the whole reason
 * this no longer anchors on `balanceToday` the way the first version did: today's balance is the one
 * figure we are certain of, but it only opens *this* month. Every other month has to be reached from
 * it — backwards through recorded entries, forwards through projection — and `openingBalance` below
 * is that walk. Anchoring each month independently would let two adjacent months disagree about the
 * boundary they share.
 */
export function monthCurve(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
  /** Any day inside the month to read. Defaults to the month containing `today`. */
  anchor: string = today,
): MonthCurve {
  const todayD = parseDay(today);
  const anchorD = parseDay(anchor);
  const from = dayKey(startOfMonth(anchorD));
  const to = dayKey(endOfMonth(anchorD));
  const days = getDaysInMonth(anchorD);

  const era: MonthCurve['era'] = to < today ? 'past' : from > today ? 'future' : 'current';

  const holding = new Set(accounts.filter((a) => a.kind !== 'card').map((a) => a.id));

  // Actual movement per day, this month, from entries.
  const moved = new Map<string, Cents>();
  for (const e of entries) {
    if (!holding.has(e.accountId) || e.date < from || e.date > to) continue;
    moved.set(e.date, (moved.get(e.date) ?? 0) + signed(e.amountCents, e.direction));
  }

  // Projected movement per day. Only ever consulted for days after today — a projection laid over a
  // day that has already happened would invent a bill the owner either paid or did not.
  const plan = new Map<string, Cents>();
  if (to > today) {
    const planFrom = from > today ? from : dayKey(addDays(todayD, 1));
    for (const o of project(series, planFrom, to, settled(entries))) {
      plan.set(o.date, (plan.get(o.date) ?? 0) + signed(o.amountCents, o.direction));
    }
  }

  let running = openingBalance(accounts, entries, series, today, from);
  const balanceStart = running;

  const points: CurvePoint[] = [];
  let trough: CurvePoint | null = null;
  let inflow = 0;
  let outflow = 0;
  let inflowDone = 0;
  let outflowDone = 0;
  let balanceNow = running;

  for (let d = 1; d <= days; d++) {
    const date = dayKey(new Date(anchorD.getFullYear(), anchorD.getMonth(), d));
    const actual = date <= today;
    const delta = (actual ? moved.get(date) : plan.get(date)) ?? 0;
    running += delta;

    const point: CurvePoint = { day: d, date, balance: running, actual, moved: delta };
    points.push(point);

    if (delta > 0) {
      inflow += delta;
      if (actual) inflowDone += delta;
    } else if (delta < 0) {
      outflow -= delta;
      if (actual) outflowDone -= delta;
    }

    if (actual) balanceNow = running;
    // The trough only means anything looking forward: a dip the owner already survived is not a
    // risk. In a month that is entirely past there is no forward half, so the whole month is read.
    const counts = era === 'past' ? true : date >= today;
    if (counts && (trough === null || point.balance < trough.balance)) trough = point;
  }

  const last = points[points.length - 1];

  return {
    points,
    todayIndex: era === 'current' ? todayD.getDate() - 1 : null,
    balanceNow: era === 'future' ? balanceStart : balanceNow,
    balanceEnd: last?.balance ?? balanceStart,
    balanceStart,
    trough: trough ?? {
      day: 1,
      date: from,
      balance: balanceStart,
      actual: era !== 'future',
      moved: 0,
    },
    inflow,
    outflow,
    inflowDone,
    outflowDone,
    from,
    to,
    era,
  };
}

/**
 * The balance carried into the first day of `from`.
 *
 * Two routes to the same figure, because the evidence changes at today. For a month that has already
 * opened, every day before it is recorded, so the entries answer directly. For a month still ahead,
 * the entries run out at today and the remainder of the walk is projection.
 */
function openingBalance(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
  from: string,
): Cents {
  const eve = dayKey(addDays(parseDay(from), -1));
  if (eve <= today) return balanceToday(accounts, entries, eve);

  let running = balanceToday(accounts, entries, today);
  for (const o of project(series, dayKey(addDays(parseDay(today), 1)), eve, settled(entries))) {
    running += signed(o.amountCents, o.direction);
  }
  return running;
}

export interface DayItem {
  title: string;
  category: string;
  amountCents: Cents;
  direction: Direction;
  /** False when this is a projection rather than something that was recorded. */
  settled: boolean;
  /** The occurrence this row is, when it is still one. Null once something has recorded it. */
  occurrence: { seriesId: string; scheduled: string; accountId: string } | null;
}

/**
 * What lands on one day, named.
 *
 * The home screen shows the day as names and figures rather than as a single total, because the
 * total is the one thing the curve already says. Names are what the shape cannot carry.
 */
export function dayItems(
  entries: Entry[],
  series: Series[],
  day: string,
  today: string,
): DayItem[] {
  if (day <= today) {
    return entries
      .filter((e) => e.date === day)
      .map((e) => ({
        title: e.title,
        category: e.category,
        amountCents: e.amountCents,
        direction: e.direction,
        settled: true,
        occurrence: null,
      }));
  }
  return project(series, day, day, settled(entries)).map((o) => ({
    title: o.title,
    category: o.category,
    amountCents: o.amountCents,
    direction: o.direction,
    settled: false,
    occurrence: { seriesId: o.seriesId, scheduled: o.date, accountId: o.accountId },
  }));
}

/** What is still committed between today and `days` from now, soonest first. */
export function upcoming(
  series: Series[],
  entries: Entry[],
  today: string,
  days = 7,
): Occurrence[] {
  const t = parseDay(today);
  const to = dayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() + days));
  return project(series, today, to, settled(entries));
}

export interface CategoryTotal {
  category: string;
  cents: Cents;
}

/**
 * Where the money went this month — actual outflow only.
 *
 * Projected spend is not spend. Mixing the two would let the chart claim the owner has already spent
 * next week's rent, which is exactly the kind of quietly wrong number that destroys trust in a
 * screen like this one.
 */
export function spendByCategory(
  entries: Entry[],
  from: string,
  to: string,
  /**
   * Series whose settlements are transfers rather than spend — see `spend.ts`. Required rather than
   * optional on purpose: a default of "count everything" would make every future caller silently
   * double-count a card purchase, and the compiler is the only thing that reliably remembers.
   */
  payments: Set<string>,
): CategoryTotal[] {
  const totals = new Map<string, Cents>();
  for (const e of entries) {
    if (!isSpend(e, payments) || e.date < from || e.date > to) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountCents);
  }
  return [...totals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}

export interface DebtStatus {
  series: Series;
  paid: number;
  total: number;
  /** What is still owed. */
  remainingCents: Cents;
  /** The month the last installment falls in. */
  finishes: string;
}

export function debtStatus(series: Series[]): DebtStatus[] {
  return series
    .filter((s): s is Series & { totalCount: number } => s.kind === 'debt' && s.totalCount != null)
    .map((s) => {
      const left = Math.max(0, s.totalCount - s.paidCount);
      const start = startOfMonth(parseDay(s.startDate));
      return {
        series: s,
        paid: s.paidCount,
        total: s.totalCount,
        remainingCents: left * s.amountCents,
        finishes: dayKey(addMonths(start, s.totalCount - 1)),
      };
    })
    .filter((d) => d.paid < d.total)
    .sort((a, b) => b.remainingCents - a.remainingCents);
}

export interface TapeItem {
  /** Stable within a day. Entries carry their row id; projections have none, so they are addressed
      by the series and the date that produced them — the same pair the engine used to make them. */
  key: string;
  title: string;
  category: string;
  amountCents: Cents;
  direction: Direction;
  /** False when this is a projection rather than something that was recorded. */
  settled: boolean;
  installment: { n: number; of: number } | null;
  /**
   * The occurrence this row *is*, when it is still one — the rule and the day it falls on.
   *
   * Only a forecast carries it, and it is what "antecipar" acts on: the screen has to name the
   * occurrence it is retiring, and re-deriving that from `key` would mean parsing a string the
   * engine built precisely so nobody had to.
   */
  occurrence: { seriesId: string; scheduled: string; accountId: string } | null;
}

export interface TapeDay {
  date: string;
  items: TapeItem[];
  /** Signed total that landed on this day. */
  moved: Cents;
  /** The balance at the close of this day. */
  balance: Cents;
  /** True for days that have already happened. */
  actual: boolean;
}

/**
 * The ledger as one continuous tape, day by day, carrying the running balance.
 *
 * This is `monthCurve` with the month taken off. The home screen reads a month because "where do I
 * stand" is a question about one, but the ledger itself has no month boundary in it — a bill due on
 * the 2nd is the next thing after a bill due on the 30th, and a list that stops at the edge of a
 * month makes the owner do the joining. So the walk runs straight through, and the month only ever
 * appears as a label on the day that opens one.
 *
 * The evidence rule is the same one the curve obeys and for the same reason: a day at or before
 * `today` is answered by entries, a day after it by projection. Laying a projection over a day that
 * has already passed would invent a bill the owner either paid or did not.
 *
 * Card accounts are excluded exactly as they are from the balance. A running figure the reader
 * cannot verify by adding up the rows above it is worse than no running figure, and a credit line
 * is not money.
 *
 * Quiet days are omitted rather than rendered empty. The balance only changes on a day that moved,
 * so a day with nothing on it has nothing to say and would only add distance between the rows that
 * do — with one exception. Today is always on the tape, moved or not: it is the boundary between
 * what happened and what is only expected, it is where a reader arrives, and a ledger that opens
 * without it has dropped the one row every other row is read against. A quiet Tuesday is noise; a
 * quiet today is the axis.
 */
export function ledgerTape(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
  from: string,
  to: string,
): TapeDay[] {
  const holding = new Set(accounts.filter((a) => a.kind !== 'card').map((a) => a.id));

  const byDay = new Map<string, TapeItem[]>();
  const push = (date: string, item: TapeItem) => {
    const bucket = byDay.get(date);
    if (bucket) bucket.push(item);
    else byDay.set(date, [item]);
  };

  for (const e of entries) {
    if (!holding.has(e.accountId) || e.date < from || e.date > to || e.date > today) continue;
    push(e.date, {
      key: e.id,
      title: e.title,
      category: e.category,
      amountCents: e.amountCents,
      direction: e.direction,
      settled: true,
      installment: null,
      occurrence: null,
    });
  }

  if (to > today) {
    const planFrom = from > today ? from : dayKey(addDays(parseDay(today), 1));
    const planned = series.filter((s) => holding.has(s.accountId));
    for (const o of project(planned, planFrom, to, settled(entries))) {
      push(o.date, {
        key: keyOf(o),
        title: o.title,
        category: o.category,
        amountCents: o.amountCents,
        direction: o.direction,
        settled: false,
        installment: o.installment,
        occurrence: { seriesId: o.seriesId, scheduled: o.date, accountId: o.accountId },
      });
    }
  }

  if (today >= from && today <= to && !byDay.has(today)) byDay.set(today, []);

  let running = openingBalance(accounts, entries, series, today, from);

  return [...byDay.keys()]
    .sort()
    .map((date) => {
      // Heaviest first inside a day. Order of insertion would mean "whatever the database returned",
      // which is not an order the reader can rely on across a reseed.
      const items = (byDay.get(date) as TapeItem[]).sort(
        (a, b) => b.amountCents - a.amountCents,
      );
      const moved = items.reduce((n, i) => n + signed(i.amountCents, i.direction), 0);
      running += moved;
      return { date, items, moved, balance: running, actual: date <= today };
    });
}
