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
 * Every occurrence the entries account for.
 *
 * `settlesDate ?? date` is the compatibility rule, and it is a widening rather than a guess: an
 * entry written before the field existed could only have been recorded on the day it was due, which
 * is precisely what the old date-equality check in the calendar assumed. Reading it that way keeps
 * those rows suppressing what they always suppressed.
 */
export function settled(entries: Entry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.seriesId === null) continue;
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
 * **Numbering is ordinal, not calendar.** The obvious implementation measures each payment's
 * distance in months from `startDate` — the way `elapsedInstallments` numbers a projected
 * occurrence — and it is wrong here, because `startDate` on a debt is *derived*, not remembered.
 * `recorrencia.tsx` recomputes it from `paidCount` on every save, so an owner who skips a month and
 * later edits an unrelated field slides the start forward. Calendar numbering then reads two
 * genuine payments as the same installment: verified, and it produced `[1, 1]`.
 *
 * The order in which payments were settled cannot slide. So the k-th oldest known payment is
 * installment `untracked + k` — untracked ones being the earliest by construction, since
 * "parcelas já pagas" is what the owner declares about the beginning of a debt. Numbers are unique
 * by that arithmetic alone, which no later edit can disturb.
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
): DebtHistory {
  const untracked = Math.max(0, paidCount - known.length);

  const payments = known
    // Oldest first to assign, newest first to return. Ties on the scheduled day are broken by the
    // day the money moved, so the order is total and two payments never contend for one number.
    .slice()
    .sort((a, b) => a.scheduled.localeCompare(b.scheduled) || a.paid.localeCompare(b.paid))
    .map((p, i) => ({ ...p, n: Math.min(untracked + i + 1, totalCount) }))
    .reverse();

  return { payments, untracked };
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

  return numbered(known, series.paidCount, series.totalCount ?? known.length);
}
