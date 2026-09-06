import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import { dayKey, occurrences, parseDay } from './projection';
import { signed, type Series } from './model';
import type { Cents } from './money';

/**
 * The rules, rather than the facts.
 *
 * Everything else in OTTO is the ledger: things that happened, or things the engine says will. This
 * is the other side — the recurrences that *produce* them. The score, not the music.
 *
 * **What a rule has that a fact does not is a cost over its life.** Spotify is not R$ 21,90; it is
 * R$ 262,80 a year, and nobody thinks of it that way. That figure is the one that gets a
 * subscription cancelled, so it is the figure this module exists to produce. For a debt the number
 * inverts: not what it costs to keep, but what is left and when it stops.
 *
 * The yearly total is not `12 × amount`. It is counted by running the projection engine over the
 * window, which inherits — for free, and identically to every other screen — the day-of-month clamp,
 * the end date, and the installment count. A subscription cancelled in March costs what it costs
 * until March, and a debt with three payments left costs three payments.
 */

/** How many calendar months "por ano" means. */
const HORIZON = 12;

export interface Commitment {
  series: Series;
  /** What one occurrence moves. Always positive; `series.direction` carries the sign. */
  monthlyCents: Cents;
  /** What it moves across the next twelve calendar months. */
  yearCents: Cents;
  /** How many occurrences fall in that window. Below twelve, something ends inside it. */
  count: number;
  /** Debts only: what is left to pay, and the month the last installment falls in. */
  remaining: { count: number; cents: Cents; finishes: string } | null;
}

/**
 * The window "por ano" covers: this whole month plus the eleven after it.
 *
 * Calendar months, not "the next twelve occurrences". Anchoring on `today` would catch thirteen
 * occurrences for a series whose day has not come round yet this month and eleven for one whose has,
 * so the same subscription would report two different yearly costs depending on the date it was
 * looked at. A reader asking what something costs per year is asking about a year, not about the
 * next twelve times it fires.
 */
function horizon(today: string): { from: string; to: string } {
  const t = parseDay(today);
  return {
    from: dayKey(startOfMonth(t)),
    to: dayKey(endOfMonth(addMonths(t, HORIZON - 1))),
  };
}

export function commitmentFor(s: Series, today: string): Commitment {
  const { from, to } = horizon(today);
  const window = occurrences(s, from, to);

  const remaining =
    s.kind === 'debt' && s.totalCount != null
      ? (() => {
          const left = Math.max(0, s.totalCount - s.paidCount);
          const start = startOfMonth(parseDay(s.startDate));
          return {
            count: left,
            cents: left * s.amountCents,
            finishes: dayKey(addMonths(start, s.totalCount - 1)),
          };
        })()
      : null;

  return {
    series: s,
    monthlyCents: s.amountCents,
    yearCents: window.reduce((n, o) => n + o.amountCents, 0),
    count: window.length,
    remaining,
  };
}

export interface Commitments {
  /** Money leaving on a schedule, heaviest first. Includes card statements. */
  out: Commitment[];
  /** Money arriving on a schedule. */
  in: Commitment[];
  /** Debts, which are outflow that ends. Kept apart because the reading is different. */
  debts: Commitment[];
  /** Finite amounts somebody owes the owner. */
  receivables: Commitment[];
  /** Per month, from the rules alone. */
  monthlyOut: Cents;
  monthlyIn: Cents;
  /**
   * What the month has left before the owner spends anything at all.
   *
   * The one number this screen is built to produce: income minus everything already promised.
   * Negative means the commitments alone do not fit.
   */
  free: Cents;
}

/**
 * Everything the ledger has committed to, split by what the reading is.
 *
 * **A card statement stays ordinary committed outflow, now that card purchases exist.**
 *
 * This comment used to say the module would have to change the day purchases landed as entries.
 * They have, and it does not — but the reason is worth writing down rather than leaving as an
 * absence.
 *
 * There is no double count here, because this module reads **series** and never reads entries: a
 * purchase on a card is an entry and never reaches this arithmetic. And the question the screen
 * asks is not *what did I spend* but *how much of my month is already promised* — a statement is
 * money that will leave the checking account on a date, which is exactly what a commitment is.
 * Dropping it would say a month with a R$ 1.240 bill has R$ 1.240 more free than it does.
 *
 * What did change is precision, not correctness: the series carries a fixed amount, while the real
 * statement is now knowable from the purchases on it. Reading the live figure instead of the
 * standing estimate is a genuine improvement and a separate one — it needs the accounts, which this
 * module deliberately does not take.
 */
export function commitments(series: Series[], today: string): Commitments {
  const all = series.map((s) => commitmentFor(s, today));
  const alive = all.filter((c) => c.remaining === null || c.remaining.count > 0);

  const by = (kind: 'in' | 'out', debt: boolean) =>
    alive
      .filter((c) => c.series.direction === kind && (c.series.kind === 'debt') === debt)
      .sort((a, b) => b.monthlyCents - a.monthlyCents);

  const out = by('out', false);
  const debts = by('out', true);
  const income = by('in', false);
  const receivables = by('in', true);

  const sum = (list: Commitment[]) => list.reduce((n, c) => n + c.monthlyCents, 0);
  const monthlyOut = sum(out) + sum(debts);
  const monthlyIn = sum(income) + sum(receivables);

  return {
    out,
    in: income,
    debts,
    receivables,
    monthlyOut,
    monthlyIn,
    free: monthlyIn - monthlyOut,
  };
}

/** Signed monthly movement, for anywhere that needs the rules as one figure. */
export function monthlyNet(series: Series[], today: string): Cents {
  const c = commitments(series, today);
  return signed(c.monthlyIn, 'in') + signed(c.monthlyOut, 'out');
}
