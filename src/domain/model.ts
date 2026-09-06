import type { Cents } from './money';

/**
 * The unified series model.
 *
 * One shape drives four things that every other finance app models separately: recurring income, a
 * recurring bill, a debt being paid down, and a credit-card statement. They differ only in whether
 * money moves in or out, and in whether the sequence ends — so they are one table with two fields
 * doing that work, not four tables that drift apart.
 *
 * Dates are plain `yyyy-MM-dd` strings in local time. A finance app that stores a due date as an
 * instant will eventually show the owner the wrong day because of a timezone they never chose.
 */

export type Direction = 'in' | 'out';

export type SeriesKind =
  /** Salary, recurring income. */
  | 'inflow'
  /** Rent, subscriptions, utilities. Runs until cancelled. */
  | 'outflow'
  /** Finite: has a total number of installments and a count already paid. */
  | 'debt'
  /** A credit-card statement: recurs monthly, amount varies, has a closing day. */
  | 'card';

export interface Account {
  id: string;
  name: string;
  /** `checking` holds money; `card` is a line of credit and never counts toward saldo. */
  kind: 'checking' | 'savings' | 'card';
  openingCents: Cents;
  /**
   * Cards only, and null until the owner says. 1–31, clamped to each month the way every other
   * day-of-month in this model is.
   *
   * Null is a real state, not a gap to paper over: a ledger that migrated from schema 1 has a card
   * and no cycle on it, and so does a card the owner has not finished setting up. Nothing may
   * invent a closing day on their behalf — the whole point of these two numbers is that they are
   * facts about a contract, and a guessed due date is worse than an absent one.
   */
  closingDay: number | null;
  dueDay: number | null;
  /** The credit line. Never money; only ever a denominator. */
  limitCents: Cents | null;
}

export interface Series {
  id: string;
  kind: SeriesKind;
  title: string;
  category: string;
  accountId: string;
  /** Always positive. `direction` carries the sign, so no amount is ever ambiguous. */
  amountCents: Cents;
  direction: Direction;
  /** 1–31. Clamped to the length of each month, so "day 31" lands on the 30th in November. */
  dayOfMonth: number;
  startDate: string;
  /** Exclusive of nothing — the last day the series may produce an occurrence. */
  endDate: string | null;
  /** Debts only: how many installments in total. */
  totalCount: number | null;
  /** Debts only: how many are already paid. */
  paidCount: number;
  /**
   * The person on the other side of a finite debt. Kept separate from `title`: "Notebook" is
   * what the debt is, "Gabriel" is who can be invited to follow it.
   */
  counterparty: string | null;
  /**
   * Present only on a debt accepted from somebody else's share. The server uses this opaque token
   * to project the owner's live values over the local mirror without exposing either account id.
   */
  linkedShareToken: string | null;
}

/** Something that actually happened. Series project; entries are fact. */
export interface Entry {
  id: string;
  /** Set when this entry settles an occurrence of a series. */
  seriesId: string | null;
  /**
   * The *scheduled* day of the occurrence this entry settles — which is not `date`.
   *
   * The two come apart the moment the owner is paid early. A salary due on the 5th that arrives on
   * the 3rd is an entry dated the 3rd settling the occurrence of the 5th, and without this field the
   * engine cannot know that: it counts the entry as fact and still projects the 5th, so the month
   * closes with two salaries in it. Inferring it from `date` is not available either — "outubro caiu
   * dia 28 de setembro" has an entry in one month settling an occurrence in the next, and no window
   * heuristic recovers that.
   *
   * Null whenever `seriesId` is null, and null is also legitimate on a settlement recorded before
   * this field existed: those were paid on the day, where date equality happened to be right.
   */
  settlesDate: string | null;
  date: string;
  /**
   * When this entry was written down, ISO-8601 with a time. Null on every row recorded before the
   * field existed.
   *
   * Distinct from `date`, and the distinction is the point. `date` is the day the money moved —
   * a fact about the world, which the owner may backdate. This is the moment OTTO learned about it,
   * which nobody edits. A shared debt needs the second one: 'paguei a parcela agora' is answered by
   * when the record appeared, not by the day it claims.
   *
   * Null is permanent for old rows rather than a gap to fill. There is no hour to recover from a
   * date-only column, and a screen that printed midnight would be inventing one.
   */
  recordedAt: string | null;
  amountCents: Cents;
  direction: Direction;
  title: string;
  category: string;
  accountId: string;
}

/** A projected event: a series' occurrence on a specific date. Never persisted. */
export interface Occurrence {
  seriesId: string;
  kind: SeriesKind;
  date: string;
  title: string;
  category: string;
  amountCents: Cents;
  direction: Direction;
  /** Debts only: which installment this is, and of how many. */
  installment: { n: number; of: number } | null;
  /**
   * The account the rule is booked against.
   *
   * Carried so that settling an occurrence early can land where the rule already says it lands. A
   * screen that looked the account up for itself would have to pick one when the lookup came back
   * empty, and "whichever conta sorts first" is a decision no screen should be making about someone
   * else's salary.
   */
  accountId: string;
}

/** Signed cents: how much this moves the balance. */
export function signed(amountCents: Cents, direction: Direction): Cents {
  return direction === 'in' ? amountCents : -amountCents;
}
