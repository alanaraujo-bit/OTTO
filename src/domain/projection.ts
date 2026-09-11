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
  type Deferral,
  type Direction,
  type Entry,
  type Occurrence,
  type Series,
} from './model';
import type { Cents } from './money';
import { landsOn, monthOf } from './deferral';
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

  /*
   * A debt stops when it runs out of *installments*, which is a fact about the calendar — not when
   * `paidCount` reaches the total, which is a fact about progress.
   *
   * The two used to be the same thing, and this returned early on `paidCount >= totalCount`. Once an
   * occurrence can be deferred they come apart, and the early return becomes a trapdoor: defer
   * parcela 7, pay every other one, and the counter reaches 24 while identity 7 was never settled.
   * The series would then project nothing at all — so the one installment still genuinely owed
   * disappears from every screen, which is the exact bug this feature exists to fix, reintroduced at
   * the tail of every debt that was ever deferred.
   *
   * So the count bounds the calendar (`withinCount`, below) and settlement is what removes an
   * occurrence — `project` filters by identity against `done`. A debt whose installments are all
   * settled emits them and has every one filtered out, which costs a walk of at most `totalCount`
   * months and cannot lose one.
   */
  const finite = series.kind === 'debt' && series.totalCount != null;

  // Walk months from the later of the range start and the series start.
  let cursor = startOfMonth(isBefore(fromD, startD) ? startD : fromD);
  const lastMonth = startOfMonth(toD);

  while (!isAfter(cursor, lastMonth)) {
    const day = Math.min(series.dayOfMonth, getDaysInMonth(cursor));
    const when = new Date(cursor.getFullYear(), cursor.getMonth(), day);

    /*
     * Which installment this month *is*, read off the calendar rather than counted as the walk goes.
     *
     * The distinction only shows itself once something can be paid out of order or pushed into
     * another month, and then it decides correctness. A counter says "the n-th one I emitted"; the
     * calendar says "the n-th month since this debt began", which is what the installment actually
     * is. A deferred occurrence keeps the number its own month gave it however far it is pushed —
     * that is the whole of why parcela 7 landing in November is still parcela 7 — and a counter
     * could not express that, because the thing it counts is emission order.
     */
    const elapsed = elapsedInstallments(series, cursor);

    const insideWindow = !isBefore(when, fromD) && !isAfter(when, toD);
    const started = !isBefore(when, startD);
    const notEnded = endD == null || !isAfter(when, endD);
    const withinCount = !finite || elapsed < (series.totalCount as number);

    if (started && notEnded && withinCount && insideWindow) {
      out.push({
        seriesId: series.id,
        kind: series.kind,
        date: dayKey(when),
        // Identity and landing day are the same thing until something defers this occurrence.
        on: dayKey(when),
        title: series.title,
        category: series.category,
        amountCents: series.amountCents,
        direction: series.direction,
        accountId: series.accountId,
        installment:
          series.kind === 'debt' && series.totalCount != null
            ? { n: elapsed + 1, of: series.totalCount }
            : null,
      });
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
  /**
   * What has been pushed to a later day. Required rather than defaulted, for exactly the reason
   * `done` is: a default of "nothing was deferred" would silently bill a caller's occurrence on the
   * day the owner moved it off, and the compiler is the only thing that reliably remembers.
   */
  deferrals: Map<string, Deferral>,
): Occurrence[] {
  const out: Occurrence[] = [];

  /*
   * The window is asked in landing days, so the walk has to cover whole months at the edges: an
   * occurrence due on the 8th and pushed to the 25th belongs to a window that opens on the 15th,
   * and a walk bounded by the window itself would never produce it to be moved.
   */
  const scanFrom = dayKey(startOfMonth(parseDay(from)));
  const scanTo = dayKey(endOfMonth(parseDay(to)));

  for (const s of all) {
    for (const o of occurrences(s, scanFrom, scanTo)) {
      const on = landsOn(s.id, o.date, deferrals);
      if (on >= from && on <= to) out.push({ ...o, on });
    }
  }

  /*
   * And the other direction: something due in a month the walk above did not touch, pushed forward
   * into this window. Driven by the deferral list rather than by widening the scan — deferrals are
   * few and explicit, while widening would make every projection pay for the rare case.
   */
  if (deferrals.size > 0) {
    const firstMonth = monthOf(scanFrom);
    const lastMonth = monthOf(scanTo);
    const byId = new Map(all.map((s) => [s.id, s]));

    for (const moved of deferrals.values()) {
      if (moved.to < from || moved.to > to) continue;
      // Already produced by the walk above, which covered these months in full.
      if (moved.month >= firstMonth && moved.month <= lastMonth) continue;
      const s = byId.get(moved.seriesId);
      if (!s) continue;
      const monthStart = `${moved.month}-01`;
      for (const o of occurrences(s, monthStart, dayKey(endOfMonth(parseDay(monthStart))))) {
        if (monthOf(o.date) === moved.month) out.push({ ...o, on: moved.to });
      }
    }
  }

  return out
    .filter((o) => !done.has(keyOf(o)))
    .sort(
      (a, b) =>
        // Landing day first: that is the order the reader sees them in.
        (a.on < b.on ? -1 : a.on > b.on ? 1 : 0) ||
        // A deferred installment and the month's own one land on the same day for the same amount,
        // so nothing above this can separate them. Their numbers can, and must: "parcela 7" and
        // "parcela 8" swapping places between two renders is the one thing this feature cannot do.
        (a.installment && b.installment ? a.installment.n - b.installment.n : 0) ||
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
    );
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
  deferrals: Map<string, Deferral>,
  /** How far ahead to look for an unsettled occurrence, in months. */
  months = 13,
): Occurrence | null {
  const t = parseDay(today);
  const from = dayKey(startOfMonth(t));
  const to = dayKey(endOfMonth(addMonths(t, months - 1)));
  return project([series], from, to, settled(entries), deferrals)[0] ?? null;
}

/**
 * What was due and nothing has settled — the bills the calendar has already gone past.
 *
 * The gap this closes: the engine answers a day at or before `today` from entries and every day
 * after it from projection, so an occurrence whose day passed without being paid was neither. It
 * did not merely stop being listed — it stopped being *owed*, and the month closed as though the
 * rent had never existed. Verified before this was written: a R$ 1.800 rent due on the 8th, unpaid
 * on the 9th, left `balanceStart`, `balanceNow` and `balanceEnd` all identical.
 *
 * **The window opens at the start of the current month and closes at today.** Not further back, and
 * the reason is not performance: "every occurrence never settled" is unbounded, so a rule created
 * two years ago with nothing recorded against it would arrive as a screen of overdue rows nobody
 * can act on. It also matches where `nextOpen` already draws the line, and for the same instinct —
 * a month that has closed is closed. The cost is real and worth naming: a bill genuinely missed in
 * a previous month is not shown here.
 *
 * Inflows are included. A salary that did not arrive is not a debt, but it is a promise the
 * forecast is still counting on, and hiding it is how a month looks fine until it isn't. The
 * screens say it differently — "não recebido", not "vencido" — which is a matter of copy, not of
 * arithmetic.
 */
export function overdue(
  series: Series[],
  entries: Entry[],
  today: string,
  deferrals: Map<string, Deferral>,
): Occurrence[] {
  const from = dayKey(startOfMonth(parseDay(today)));
  return project(series, from, today, settled(entries), deferrals);
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
  /**
   * What was due this month and has not been settled, and what it adds up to.
   *
   * Empty on any month that is not the current one: a past month's misses are not actionable from
   * here, and a future month has nothing to be late yet. See `overdue`.
   */
  overdue: Occurrence[];
  overdueCents: Cents;
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
  deferrals: Map<string, Deferral>,
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
    for (const o of project(series, planFrom, to, settled(entries), deferrals)) {
      plan.set(o.on, (plan.get(o.on) ?? 0) + signed(o.amountCents, o.direction));
    }
  }

  /*
   * What was already due and never settled, and where it lands in the arithmetic.
   *
   * It cannot go on its own day. Every day at or before today is answered by entries so that the
   * running balance is verifiable by adding up the rows above it, and putting an unpaid bill there
   * would have the app assert that money left the account when it plainly did not.
   *
   * So it is carried to the first day the forecast owns — tomorrow — which is also the earliest it
   * could truthfully happen. The curve stays continuous, `balanceNow` stays exactly the sum of what
   * was recorded, and the month stops closing on a figure that quietly forgot the rent. The screens
   * get `overdueCents` to name it separately, because "already late" is not the same news as
   * "coming up".
   */
  const late = era === 'current' ? overdue(series.filter((s) => holding.has(s.accountId)), entries, today, deferrals) : [];
  const overdueCents = late.reduce((n, o) => n + o.amountCents, 0);
  if (era === 'current' && to > today) {
    const tomorrow = dayKey(addDays(todayD, 1));
    for (const o of late) {
      plan.set(tomorrow, (plan.get(tomorrow) ?? 0) + signed(o.amountCents, o.direction));
    }
  }

  let running = openingBalance(accounts, entries, series, today, from, deferrals);
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
    overdue: late,
    overdueCents,
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
  deferrals: Map<string, Deferral>,
): Cents {
  const eve = dayKey(addDays(parseDay(from), -1));
  if (eve <= today) return balanceToday(accounts, entries, eve);

  let running = balanceToday(accounts, entries, today);
  // What is still owed from this month travels with the walk: a month reached from today has to
  // carry the bills today has not paid, or every month after it opens richer than it is.
  for (const o of overdue(series, entries, today, deferrals)) {
    running += signed(o.amountCents, o.direction);
  }
  for (const o of project(series, dayKey(addDays(parseDay(today), 1)), eve, settled(entries), deferrals)) {
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
  /**
   * True when its day has already passed and nothing settled it. Still a projection — the money has
   * not moved — but it is late rather than merely expected, and the screens say so differently.
   */
  overdue: boolean;
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
  deferrals: Map<string, Deferral>,
): DayItem[] {
  const asItem = (o: Occurrence, late: boolean): DayItem => ({
    title: o.title,
    category: o.category,
    amountCents: o.amountCents,
    direction: o.direction,
    settled: false,
    overdue: late,
    occurrence: { seriesId: o.seriesId, scheduled: o.date, accountId: o.accountId },
  });

  if (day <= today) {
    const recorded = entries
      .filter((e) => e.date === day)
      .map((e) => ({
        title: e.title,
        category: e.category,
        amountCents: e.amountCents,
        direction: e.direction,
        settled: true,
        overdue: false,
        occurrence: null,
      }));

    /*
     * A day that has passed is answered by what was recorded — and by what was due on it and never
     * was. The second half used to be dropped on the argument that laying a projection over a past
     * day invents a bill the owner either paid or did not. The argument holds for a bill that *was*
     * paid, and settlement already removes those by identity; what was left over was not an
     * invention but the one thing still genuinely owed.
     */
    const monthStart = dayKey(startOfMonth(parseDay(today)));
    const late =
      day >= monthStart
        ? project(series, day, day, settled(entries), deferrals).map((o) => asItem(o, true))
        : [];

    return [...recorded, ...late];
  }

  return project(series, day, day, settled(entries), deferrals).map((o) => asItem(o, false));
}

/** What is still committed between today and `days` from now, soonest first. */
export function upcoming(
  series: Series[],
  entries: Entry[],
  today: string,
  deferrals: Map<string, Deferral>,
  days = 7,
): Occurrence[] {
  const t = parseDay(today);
  const to = dayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() + days));
  return project(series, today, to, settled(entries), deferrals);
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
  /** True when its day has passed and nothing settled it. Draws on its day, moves no balance. */
  overdue: boolean;
  /** The hour the owner gave this lançamento, when they gave one. Always null on a projection —
      there is no hour to show for money that has not moved yet. */
  time: string | null;
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
  deferrals: Map<string, Deferral>,
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
      overdue: false,
      time: e.time,
      installment: null,
      occurrence: null,
    });
  }

  const planned = series.filter((s) => holding.has(s.accountId));
  const asItem = (o: Occurrence, late: boolean): TapeItem => ({
    key: keyOf(o),
    title: o.title,
    category: o.category,
    amountCents: o.amountCents,
    direction: o.direction,
    settled: false,
    overdue: late,
    time: null,
    installment: o.installment,
    occurrence: { seriesId: o.seriesId, scheduled: o.date, accountId: o.accountId },
  });

  if (to > today) {
    const planFrom = from > today ? from : dayKey(addDays(parseDay(today), 1));
    for (const o of project(planned, planFrom, to, settled(entries), deferrals)) {
      push(o.on, asItem(o, false));
    }
  }

  /*
   * The overdue rows, drawn on the day they were due and contributing nothing to the running total.
   *
   * Both halves of that matter. Drawn on their own day, because that is where the reader looks for
   * them and what makes "venceu dia 8" legible. Contributing nothing, because this column's whole
   * claim is that a reader can verify it by adding up the rows above — see the note on this
   * function — and an unpaid bill has moved no money. So the row shows, the balance does not budge,
   * and the arithmetic stays honest in both directions at once.
   */
  for (const o of overdue(planned, entries, today, deferrals)) {
    if (o.on < from || o.on > to) continue;
    push(o.on, asItem(o, true));
  }

  if (today >= from && today <= to && !byDay.has(today)) byDay.set(today, []);

  let running = openingBalance(accounts, entries, series, today, from, deferrals);

  return [...byDay.keys()]
    .sort()
    .map((date) => {
      // Heaviest first inside a day. Order of insertion would mean "whatever the database returned",
      // which is not an order the reader can rely on across a reseed. Two installments of one debt
      // landing together — a deferred one beside the month's own — are the same amount to the cent,
      // so the number is the only thing that can separate them, and it has to: parcela 7 and
      // parcela 8 trading places between renders would undo the point of numbering them.
      const items = (byDay.get(date) as TapeItem[]).sort(
        (a, b) =>
          b.amountCents - a.amountCents ||
          (a.installment && b.installment ? a.installment.n - b.installment.n : 0),
      );
      // An overdue row is money still owed, not money that moved. It draws on its day and leaves
      // the running balance alone — see where it is pushed, above.
      const moved = items.reduce(
        (n, i) => (i.overdue ? n : n + signed(i.amountCents, i.direction)),
        0,
      );
      running += moved;
      return { date, items, moved, balance: running, actual: date <= today };
    });
}
