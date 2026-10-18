import type { Account } from '@/domain/model';

/**
 * The opening figure that makes an account read `targetCents` today.
 *
 * An account's balance is never stored: it is `openingCents` plus every lançamento booked to it up to
 * today (`balanceToday`). So "my balance is R$ X" is answered by solving for the opening, which leaves
 * every lançamento exactly where it was and invents none to explain the difference. Contas' "Saldo
 * hoje" field and the assistant's `definir_saldo` are the same request, and this is the one rule
 * both of them have to agree on — typing the balance into the opening field directly is the bug this
 * exists to prevent: the figure shown on the row would move by everything already lançado.
 *
 * `currentCents` is `balanceToday([account], entries, today)`, taken by the caller because it already
 * has the ledger at hand.
 */
export function openingFor(account: Account, currentCents: number, targetCents: number): number {
  return account.openingCents + (targetCents - currentCents);
}
