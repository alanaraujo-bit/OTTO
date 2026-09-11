import type { Deferral } from './model';

/**
 * Where a deferred occurrence lands, and how it is found again.
 *
 * Settlement and deferral are the two things that can be true about an occurrence the rule has not
 * yet produced a fact for: it already happened, or it happens later. `settlement.ts` owns the first.
 * This owns the second, in the same style and for the same reason — the fact is addressed by
 * identity, so nothing about the series is mutated to make it true, and removing the fact puts the
 * occurrence back exactly where the rule always said it was.
 *
 * The two differ in one thing only, and it is deliberate: settlement is keyed by the occurrence's
 * **day**, deferral by its **month**. A settlement is a real entry against a real due date and there
 * is nothing coarser to key it by. A deferral is a statement about which of the series' monthly
 * slots is being moved, and the month is the honest precision for that — it survives the owner
 * correcting `dayOfMonth` afterwards, and it is the same arithmetic the installment number already
 * comes from. Keying it by day would mean a rule edit silently orphans the deferral, and an orphaned
 * deferral does not merely stop working: the original occurrence stops being suppressed while the
 * moved one keeps being drawn, so one parcela renders as two.
 */

/** The month an occurrence belongs to, `yyyy-MM`. Sliced rather than parsed: these are day keys. */
export const monthOf = (date: string): string => date.slice(0, 7);

/** The identity of one deferrable slot. Formed in one place only, like `occurrenceKey`. */
export const deferralKey = (seriesId: string, month: string) => `${seriesId}@${month}`;

/**
 * The deferrals, indexed for lookup during a projection walk.
 *
 * Built once per screen and passed down rather than derived inside the engine: `monthCurve` and
 * `ledgerTape` both sit on the ledger's hot path and both call into the projection more than once,
 * so a map rebuilt per call multiplies with the render.
 *
 * Last write wins on a duplicate key. The repository writes these replace-by-key so duplicates
 * should not exist, but a ledger document is a wire format and this is the reading that cannot
 * produce two occurrences from one slot.
 */
export function deferralMap(deferrals: Deferral[]): Map<string, Deferral> {
  const out = new Map<string, Deferral>();
  for (const d of deferrals) out.set(deferralKey(d.seriesId, d.month), d);
  return out;
}

/** No deferrals at all. Named so a caller that has none says so rather than building an empty map. */
export const NO_DEFERRALS: Map<string, Deferral> = new Map();

/**
 * The day an occurrence actually lands on, given what has been deferred.
 *
 * `scheduled` is the occurrence's identity and is never what this returns unless nothing moved it.
 *
 * **A deferral that does not move the occurrence forward is not a deferral.** Anything landing on or
 * before the original day is read as absent rather than honoured, which is the one place this
 * module refuses to trust its input. The reason is not tidiness: the overdue window only looks back
 * to the start of the current month, so an occurrence pushed *backwards* into a closed month would
 * become permanently invisible — never projected, because its day has passed; never listed as
 * overdue, because it falls outside the window. A silent disappearance is the worst failure this
 * feature can have, so the impossible state is refused at the read rather than guarded at each use.
 */
export function landsOn(
  seriesId: string,
  scheduled: string,
  deferrals: Map<string, Deferral>,
): string {
  const moved = deferrals.get(deferralKey(seriesId, monthOf(scheduled)));
  return moved != null && moved.to > scheduled ? moved.to : scheduled;
}
