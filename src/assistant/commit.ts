import {
  deferOccurrence,
  deleteAccount,
  deleteEntry,
  deleteSeries,
  insertAccount,
  insertEntry,
  insertSeries,
  renameCategory,
  setCap,
  setCategory,
  settleOccurrence,
  updateAccount,
  updateEntry,
  updateSeries,
} from '@/db/repo';
import { confirmDestructiveAction } from '@/lib/auth/lock';
import type { Mutation } from './tools';

/** The owner backed out at the biometric prompt. Not a failure: nothing was asked of the server. */
export class Declined extends Error {}

/**
 * Perform a confirmed plan — through the same repository call the screen for it uses.
 *
 * Nothing here is new write logic, and that is the point. Each op is one existing mutator, with the
 * retry-on-lost-answer and the check-first idempotency `repo.ts` already gives every screen, so a
 * lançamento Otto records is indistinguishable from one typed into `lançar`.
 *
 * Deleting an account keeps the screen's extra ceremony: its lançamentos cascade with it, and Contas
 * asks for a fingerprint before that. A confirmation card is a tap, and a tap is not enough for this.
 */
export async function commit(m: Mutation): Promise<void> {
  switch (m.op) {
    case 'insertEntry': return insertEntry(m.entry);
    case 'updateEntry': return updateEntry(m.entry);
    case 'deleteEntry': return deleteEntry(m.id);
    case 'insertSeries': return insertSeries(m.series);
    case 'updateSeries': return updateSeries(m.series);
    case 'deleteSeries': return deleteSeries(m.id);
    case 'defer': return deferOccurrence(m.seriesId, m.month, m.to);
    case 'settle': return settleOccurrence(m.seriesId, m.scheduled, m.entry);
    case 'insertAccount': return insertAccount(m.account);
    case 'updateAccount': return updateAccount(m.account);
    case 'deleteAccount': {
      if (!(await confirmDestructiveAction(`Confirme para excluir ${m.name}`))) throw new Declined();
      return deleteAccount(m.id);
    }
    case 'setCap': return setCap(m.category, m.capCents);
    case 'category': {
      // Rename first, then dress: the same order `categorias.tsx` saves in, so the look lands on the
      // name that now exists rather than on the one that just went away.
      if (m.to !== m.from) await renameCategory(m.from, m.to);
      return setCategory(m.to, m.look);
    }
  }
}
