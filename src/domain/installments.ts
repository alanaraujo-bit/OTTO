import type { Cents } from './money';

/**
 * Per-installment overrides for a debt: one-based installment number → amount.
 *
 * Sparse on purpose. Only the installments that differ from the standard amount are stored, so a
 * debt that is simply 14 × R$100 has no overrides at all, and "13 × R$100 + 1 × R$400" stores one
 * entry. Every total in the app is computed through the functions below, so the owner's number and
 * the number a shared link shows cannot drift apart.
 */
export type InstallmentOverrides = Record<string, Cents>;

/** The amount of installment `n` (one-based): its override when it has one, the standard otherwise. */
export function installmentCents(
  base: Cents,
  overrides: InstallmentOverrides | null | undefined,
  n: number,
): Cents {
  return overrides?.[String(n)] ?? base;
}

/** Whether any installment differs from the standard amount. */
export function hasOverrides(overrides: InstallmentOverrides | null | undefined): boolean {
  return !!overrides && Object.keys(overrides).length > 0;
}

/** Total of installments `from..to`, both inclusive and one-based. Empty range is zero. */
export function sumInstallments(
  base: Cents,
  overrides: InstallmentOverrides | null | undefined,
  from: number,
  to: number,
): Cents {
  let sum = 0;
  for (let n = from; n <= to; n++) sum += installmentCents(base, overrides, n);
  return sum;
}

/**
 * Pin the installments already paid to the amount they were paid at, when the standard amount moves.
 *
 * Installments without an override follow the standard — that is what "standard" means — so changing
 * the base amount of a debt would silently revalue the ones already paid, and the total would drift
 * away from the money that actually left. A paid installment has no business moving. So each one that
 * was paid before this save and had no override of its own is given one, at the amount it had.
 *
 * Installments paid *by* this save are not pinned: nothing has been paid at the old figure for them.
 */
export function pinPaidInstallments(
  previous: { amountCents: Cents; installmentAmounts?: InstallmentOverrides | null; paidCount: number },
  next: { amountCents: Cents; overrides: InstallmentOverrides | null | undefined },
): InstallmentOverrides | null {
  const out: InstallmentOverrides = { ...(next.overrides ?? {}) };
  for (let n = 1; n <= previous.paidCount; n++) {
    const key = String(n);
    if (out[key] !== undefined) continue;
    const was = installmentCents(previous.amountCents, previous.installmentAmounts, n);
    if (was !== next.amountCents) out[key] = was;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The overrides that actually mean something, for a debt of `total` installments at `base`.
 *
 * This is the one place the rules about overrides live, and the editor runs its draft through it
 * before showing a total or saving, so the preview is always the thing that gets written:
 *
 * - a key outside `1..total` is dropped — reducing the number of installments orphans it;
 * - a value that is not a positive integer is dropped — an empty field means "standard", and zero is
 *   refused by the editor before it gets here;
 * - a value equal to `base` is dropped — an override that says the standard amount is not a change,
 *   and keeping it would make an installment look custom when nothing about it is.
 *
 * Returns `null`, not `{}`, when nothing survives. `null` is what the server stores as "no overrides"
 * and what survives JSON; `undefined` would be dropped silently and read as "the field is absent".
 */
export function normalizeOverrides(
  base: Cents,
  total: number,
  raw: Record<string, number | null | undefined> | null | undefined,
): InstallmentOverrides | null {
  if (!raw) return null;
  const out: InstallmentOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || n > total) continue;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) continue;
    if (value === base) continue;
    out[String(n)] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}
