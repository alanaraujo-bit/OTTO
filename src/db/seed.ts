import { replaceLedger } from './repo';
import { sampleMonth } from '@/domain/sampleMonth';

/** Replaces the server ledger only when the owner explicitly asks for demo data. */
export async function seed(today = new Date()): Promise<void> {
  // The sample ledger sets no ceilings. A demo that arrived with someone else's budget already in
  // it would be teaching the wrong thing about whose numbers these are.
  // Nor does it defer anything: a demo whose bills had already been pushed around would be showing
  // the owner a decision they never made.
  await replaceLedger({ ...sampleMonth(today), caps: [], categories: [], deferrals: [] });
}
