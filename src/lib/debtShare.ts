import { api } from './api';
import { numbered, type DebtHistory } from '@/domain/settlement';

export interface DebtShareSummary {
  token: string;
  recipientName: string;
  acceptedAt: string | null;
}

export interface PublicDebtShare {
  ownerName: string;
  recipientName: string;
  acceptedAt: string | null;
  title: string;
  category: string;
  amountCents: number;
  direction: 'in' | 'out';
  dayOfMonth: number;
  startDate: string;
  totalCount: number;
  paidCount: number;
  /**
   * The payments the owner has actually recorded, oldest first.
   *
   * Optional because the API may not have been redeployed yet, and a viewer on an old server must
   * still see the debt rather than a crash. Absent and empty are read the same way here — as "no
   * payment has a date attached" — which `debtHistory` then reconciles against `paidCount`.
   */
  payments?: PublicDebtPayment[];
}

export interface PublicDebtPayment {
  /** The day the installment was due. */
  scheduled: string;
  /** The day the money actually moved. */
  paidOn: string;
  recordedAt: string | null;
  amountCents: number;
}

/**
 * The public payload, read as history.
 *
 * Numbering and reconciliation both go through `numbered`, the same function the app-side history
 * uses, so the owner and the person holding the link never see one payment under two different
 * numbers. This function only renames fields; it decides nothing.
 */
export function historyOf(debt: PublicDebtShare): DebtHistory {
  return numbered(
    (debt.payments ?? []).map((p) => ({
      scheduled: p.scheduled,
      paid: p.paidOn,
      recordedAt: p.recordedAt,
      amountCents: p.amountCents,
    })),
    debt.paidCount,
    debt.totalCount,
    // Already in the public payload, so the reader on the web numbers a payment with the same
    // arithmetic the owner's app does — without the payload ever having to carry a deferral.
    debt.startDate,
  );
}

export async function getDebtShare(seriesId: string): Promise<DebtShareSummary | null> {
  return api<DebtShareSummary | null>(`/v1/debts/${encodeURIComponent(seriesId)}/share`);
}

export async function shareDebt(seriesId: string, recipientName: string) {
  return api<DebtShareSummary>(`/v1/debts/${encodeURIComponent(seriesId)}/share`, {
    method: 'POST',
    body: JSON.stringify({ recipientName }),
  });
}

export async function revokeDebtShare(seriesId: string) {
  return api<void>(`/v1/debts/${encodeURIComponent(seriesId)}/share`, { method: 'DELETE' });
}

export async function readPublicDebt(token: string) {
  return api<PublicDebtShare>(`/v1/debt-shares/${encodeURIComponent(token)}`, {}, false);
}

export async function acceptDebtShare(token: string) {
  return api<{ status: 'accepted'; seriesId: string }>(
    `/v1/debt-shares/${encodeURIComponent(token)}/accept`,
    { method: 'POST' },
  );
}

export function debtShareUrl(token: string) {
  const base = process.env.EXPO_PUBLIC_SHARE_URL?.replace(/\/$/, '');
  if (!base) throw new Error('O endereço público do OTTO ainda não está configurado.');
  return `${base}/divida/${token}`;
}

export function apkUrl() {
  return process.env.EXPO_PUBLIC_APK_URL?.trim() || null;
}
