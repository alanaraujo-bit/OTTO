import { addMonths, format, getDaysInMonth, parseISO, startOfMonth } from 'date-fns';
import type { Entry, Occurrence, Series } from './model';
import type { Cents } from './money';

/**
 * Which occurrences have already been settled.
 *
 * A series is a rule and an entry is a fact, and until now the only thing standing between them was
 * the calendar: the engine answered a day at or before `today` from entries and every day after it
 * from projection. That works exactly as long as money arrives on the day it was promised.
 *
 * It does not. The salary due on the 5th lands on the 3rd, the rent gets paid a week early, the
 * invoice is settled the moment it is agreed. In every one of those the fact and the rule overlap,
 * and a boundary drawn at `today` counts both — the entry as record and the occurrence as forecast.
 *
 * So settlement is made explicit and addressed by identity rather than by date: an occurrence is the
 * pair `(seriesId, scheduled date)`, and an entry that carries that pair retires it. The next
 * occurrence of the series is then next month's, which is the whole of what "a assinatura já vai
 * para o mês seguinte" asks for — and it falls out without touching `dayOfMonth` or `startDate`,
 * so a future month keeps the due date the owner actually set. Deleting the entry brings the
 * occurrence back, because nothing was mutated to make it go away.
 */

/** The identity of one occurrence. The same pair on both sides, formed in one place only. */
export const occurrenceKey = (seriesId: string, scheduled: string) => `${seriesId}@${scheduled}`;

export const keyOf = (o: Occurrence) => occurrenceKey(o.seriesId, o.date);

/**
 * The series a card's statements are settled against — one per card, its id derived from the card's.
 *
 * A statement is not a rule: its amount is whatever was charged on the card in the cycle, and its
 * occurrences are produced from the card's own closing and due days (`statementForecast` in
 * `card.ts`), never from this row. The row exists for one reason. A payment has to say *which*
 * statement it paid, and the only field an entry has for "this settles that" is `seriesId` — which
 * the server checks against the ledger's series and the database holds to a foreign key. So the
 * statement is given a series to be addressed by, and the payment carries the familiar pair: this
 * id, and the statement's due date in `settlesDate`.
 *
 * Derived rather than random so that the forecast, which runs before any such row exists, already
 * names the id the payment will carry, and so that creating the row is idempotent — the first
 * payment of a card writes it, every later one finds it there. See `settleOccurrence` in `repo.ts`.
 *
 * The prefix is a fact this code writes, not a name the owner typed — which is the line `spend.ts`
 * draws. Nothing else in the app creates an id of this shape (rows get UUIDs).
 */
const STATEMENT = 'fatura-';
export const statementSeriesId = (cardId: string) => `${STATEMENT}${cardId}`;
export const isStatementSeries = (seriesId: string | null): boolean =>
  seriesId !== null && seriesId.startsWith(STATEMENT);

/**
 * Every occurrence the entries account for.
 *
 * `settlesDate ?? date` is the compatibility rule, and it is a widening rather than a guess: an
 * entry written before the field existed could only have been recorded on the day it was due, which
 * is precisely what the old date-equality check in the calendar assumed. Reading it that way keeps
 * those rows suppressing what they always suppressed.
 *
 * Statement payments are left out. A statement is settled by amount, not by identity: a partial
 * payment leaves the rest of it owed, and a key in this set would retire the whole statement on the
 * first real of it. `statementForecast` nets the payments out of the statement instead, so a fully
 * paid one simply has nothing left to project.
 */
export function settled(entries: Entry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.seriesId === null || isStatementSeries(e.seriesId)) continue;
    out.add(occurrenceKey(e.seriesId, e.settlesDate ?? e.date));
  }
  return out;
}

/**
 * The payment history of a debt: which installment, when it was due, when it was actually paid.
 *
 * **Derived from entries, never from `paidCount`.** The two are different facts and they are
 * allowed to disagree. `paidCount` is a number the owner can type — "quantas parcelas já paguei"
 * on the recurrence form — so a debt created saying three are paid has three installments behind
 * it and no entry describing any of them. Deleting a settlement entry does not decrement it
 * either. Reading history off that counter would mean inventing dates for payments nobody ever
 * recorded, which is exactly the lie a shared link must not tell.
 *
 * So the honest shape has two parts: the payments that are *known*, each with its real date, and a
 * count of the ones that are only *claimed*. `untracked` is that gap, and it is not an error state
 * — it is the ordinary case for a debt that existed before OTTO did.
 *
 * **Numbering is by calendar identity, with an ordinal floor.**
 *
 * This used to be purely ordinal — the k-th oldest known payment was installment `untracked + k` —
 * and the argument for it was that `startDate` could not be trusted, because `recorrencia.tsx`
 * recomputed it from `paidCount` on every save and so slid forward whenever a month was skipped.
 * That argument has been retired at its source: the start date is now written once, when the debt is
 * created, and never recomputed. See the note on `startDateFor`.
 *
 * The reason it had to be retired is that ordinal numbering cannot survive a payment made out of
 * order, and deferral exists precisely to create them. Verified before this change: a debt with six
 * installments declared, parcela 7 deferred into November, November's own parcela 8 paid first —
 * ordinal numbering labelled it **7**. It self-corrected only once both were settled, which is no
 * comfort at the moment the owner is looking at the receipt for the one they just paid.
 *
 * So a payment's number now comes from its own scheduled month, exactly as a projected occurrence's
 * does, and the two agree by construction rather than by coincidence. `untracked` remains the floor:
 * installments declared without a record are the earliest by definition, since "parcelas já pagas"
 * is a statement about the beginning of a debt.
 *
 * **The floor also guarantees uniqueness.** Rows written before the start date was frozen can still
 * carry a slid `startDate`, and a legacy row with no `settlesDate` falls back to the day it was
 * paid — either can put two payments in one month and ask for one number twice. Assigning in
 * scheduled order and never letting a number repeat the one before it keeps calendar numbering
 * wherever the data supports it and degrades to ordinal exactly where it does not.
 */
export interface DebtPayment {
  /** Which installment this settles, 1-based. */
  n: number;
  /** The day the installment was due. */
  scheduled: string;
  /** The day the money actually moved. Equal to `scheduled` unless it was paid off-day. */
  paid: string;
  /**
   * The instant the payment was recorded in OTTO, ISO-8601, or null.
   *
   * Null on every payment recorded before this field existed, and that is permanent for those rows:
   * an entry has always carried a day, never a time, so there is no hour to recover. A screen shows
   * the time when there is one and the day alone when there is not — it never fabricates midnight.
   */
  recordedAt: string | null;
  amountCents: Cents;
}

export interface DebtHistory {
  /** Known payments, most recent first. */
  payments: DebtPayment[];
  /** Installments counted as paid that no entry accounts for. */
  untracked: number;
}

/**
 * Number a set of known payments and reconcile them against the claimed count.
 *
 * Shared by the app, which reads entries, and by the shared link, which reads a public payload —
 * so a reader on the web and the owner in the app never see the same payment under two different
 * numbers. That guarantee is the only reason this is one function instead of two.
 */
export function numbered(
  known: Omit<DebtPayment, 'n'>[],
  paidCount: number,
  totalCount: number,
  /**
   * The debt's first installment month — `firstInstallment(series)`, not the raw `startDate`, which
   * is a month late for a debt created after its due day. Required rather than optional: a default
   * would silently restore ordinal numbering for whichever caller forgot it, and the whole guarantee
   * here is that the app and the shared link number one payment identically.
   */
  firstMonth: string,
): DebtHistory {
  const untracked = Math.max(0, paidCount - known.length);

  // Oldest first to assign, newest first to return. Ties on the scheduled day are broken by the day
  // the money moved, so the order is total and two payments never contend for one number.
  const ordered = known
    .slice()
    .sort((a, b) => a.scheduled.localeCompare(b.scheduled) || a.paid.localeCompare(b.paid));

  let previous = untracked;
  const payments = ordered
    .map((p) => {
      const n = Math.max(installmentOf(p.scheduled, firstMonth), previous + 1);
      previous = n;
      return { ...p, n: Math.min(n, totalCount) };
    })
    .reverse();

  return { payments, untracked };
}

/**
 * The month a debt's installment 1 falls in, as `yyyy-MM-01`.
 *
 * Not simply the month of `startDate`, and the difference is a debt created after its own due day.
 * The recurrence form writes `startDate = today` for a debt with nothing paid yet; created on the
 * 18th with a due day of 10, the occurrence of that month is *before* the debt started, so
 * `occurrences` never emits it — the first installment the owner will ever pay is next month's.
 * Numbering from the start's own month anyway made that first payment "parcela 2" and, because the
 * count bounds the calendar, silently dropped the last installment: a 17-installment debt projected
 * 16.
 *
 * So installment 1 is the first month whose due day is on or after `startDate`, which is exactly the
 * `started` test `occurrences` applies — the numbering and the emission now ask the same question.
 * A debt created with installments already paid starts on the 1st of a month (`startDateFor`), so
 * for every such debt, and for every debt created on or before its due day, this is the start's own
 * month and nothing changes.
 *
 * Takes only the two fields it reads so the shared link, whose payload carries both, numbers with it
 * too.
 */
export function firstInstallment(series: Pick<Series, 'startDate' | 'dayOfMonth'>): string {
  const start = parseISO(series.startDate);
  const month = startOfMonth(start);
  const due = Math.min(series.dayOfMonth, getDaysInMonth(month));
  return format(due < start.getDate() ? addMonths(month, 1) : month, 'yyyy-MM-dd');
}

/**
 * Which installment a scheduled day is, 1-based: the number of months from the debt's first one.
 *
 * The same arithmetic `elapsedInstallments` uses to number a projected occurrence, kept here in the
 * terms a recorded payment arrives in. Both must produce one number for one installment — the app,
 * the shared link and the projection all read it — and the only way to guarantee that is for the
 * number to be a function of the month and nothing else.
 */
function installmentOf(scheduled: string, firstMonth: string): number {
  const start = startOfMonth(parseISO(firstMonth));
  const at = startOfMonth(parseISO(scheduled));
  return (at.getFullYear() - start.getFullYear()) * 12 + (at.getMonth() - start.getMonth()) + 1;
}

export function debtHistory(series: Series, entries: Entry[]): DebtHistory {
  const known = entries
    .filter((e) => e.seriesId === series.id)
    .map((e) => ({
      scheduled: e.settlesDate ?? e.date,
      paid: e.date,
      recordedAt: e.recordedAt,
      amountCents: e.amountCents,
    }));

  return numbered(known, series.paidCount, series.totalCount ?? known.length, firstInstallment(series));
}
