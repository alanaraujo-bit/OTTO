import { api, OfflineError } from '@/lib/api';
import type { Account, Deferral, Entry, Series } from '@/domain/model';
import type { Cap } from '@/domain/cap';
import type { Category } from '@/domain/category';

export interface Ledger {
  accounts: Account[];
  series: Series[];
  entries: Entry[];
  /**
   * The ceilings the owner has set, by category.
   *
   * Kept in the ledger document rather than behind an endpoint of its own, so it inherits the write
   * path that was just made durable: the same retry, the same idempotent mutators, the same single
   * transaction. A budget that saved while the lançamento beside it did not would be a worse kind of
   * wrong than either failing.
   *
   * Optional on the way in, because a build older than this field PUTs a document without it and
   * must not have its whole ledger rejected over a budget it does not know about.
   */
  caps: Cap[];
  /**
   * The categories the owner has dressed themselves — icon, colour, description.
   *
   * Only the ones they touched. A category nobody edited has no row here and gets its look assigned
   * from its name by `domain/category`, which is what keeps this list short and keeps a fresh
   * ledger from needing curation before it can draw a chart.
   *
   * Optional on the way in for the same reason `caps` is.
   */
  categories: Category[];
  /**
   * Occurrences the owner has pushed to a later day, by `(seriesId, month)`.
   *
   * Optional on the way in for the same reason `caps` and `categories` are: a build older than this
   * field PUTs a document without it, and must not have its whole ledger rejected — or, worse, its
   * deferrals silently dropped — over something it does not know about.
   */
  deferrals: Deferral[];
}

/** Railway PostgreSQL is the sole durable store. The device never writes financial rows locally. */
export async function readLedger(): Promise<Ledger> {
  const ledger = await api<Ledger>('/v1/ledger');
  // A server that has not been redeployed yet simply has nothing to say about caps. Absent and
  // empty are the same thing for a ceiling, which is the one place a default is safe here.
  return {
    ...ledger,
    caps: ledger.caps ?? [],
    categories: ledger.categories ?? [],
    deferrals: ledger.deferrals ?? [],
  };
}

async function writeLedger(ledger: Ledger): Promise<void> {
  await api<Ledger>('/v1/ledger', { method: 'PUT', body: JSON.stringify(ledger) });
}

/**
 * Read the ledger, change it, write it back — and survive a lost answer.
 *
 * The whole ledger is one document, so every write is a read-modify-write, and on a phone the last
 * leg of that is the one that fails: the request arrives, the server commits, and the reply is lost
 * on the way back. The owner then reads "não salvou" about something that saved, and finds it
 * waiting for them the next time they open the app. That is the worst thing a finance app can say,
 * because it is a lie in the direction that makes someone record the same money twice.
 *
 * So a lost answer is retried rather than reported. What makes that safe is not the retry — it is
 * the **mutators**: each one checks first and returns the ledger untouched if its change is already
 * there. A retry therefore re-reads a ledger that may already contain the write, finds it, and
 * writes the same document back, which is a no-op rather than a duplicate. Without that discipline
 * this loop would post one lançamento twice under a single id, and the server would reject the whole
 * document on its primary key — turning a recoverable blip into a hard failure.
 *
 * Only a dropped connection is retried. A 400 is the server saying the document is wrong, and
 * sending it again unchanged would only be wrong again, more slowly.
 */
async function change(mutator: (ledger: Ledger) => Ledger): Promise<void> {
  let lost: OfflineError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await writeLedger(mutator(await readLedger()));
      return;
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      lost = e;
      // A short, growing pause. A phone coming out of a tunnel needs a moment, and hammering a
      // connection that has just dropped is the reliable way to make it drop again.
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lost as OfflineError;
}

export async function replaceLedger(ledger: Ledger): Promise<void> {
  await writeLedger(ledger);
}

/** Irreversibly removes the signed-in owner's financial data from Railway. */
export async function clearLedger(): Promise<void> {
  await api<void>('/v1/ledger', { method: 'DELETE' });
}

/*
 * The three inserts below guard on id before appending, and that guard is what lets `change` retry
 * at all — see its note. It is not defensive coding: on a retry the ledger being read *is* the one
 * the lost attempt already wrote, so the row is genuinely there, and appending it again would post
 * the same id twice.
 */
export async function insertAccount(account: Account): Promise<void> {
  await change((ledger) =>
    ledger.accounts.some((item) => item.id === account.id)
      ? ledger
      : { ...ledger, accounts: [...ledger.accounts, account] },
  );
}

export async function updateAccount(account: Account): Promise<void> {
  await change((ledger) => ({ ...ledger, accounts: ledger.accounts.map((item) => item.id === account.id ? account : item) }));
}

export async function deleteAccount(id: string): Promise<void> {
  await change((ledger) => ({
    ...ledger,
    accounts: ledger.accounts.filter((item) => item.id !== id),
    series: ledger.series.filter((item) => item.accountId !== id),
    entries: ledger.entries.filter((item) => item.accountId !== id),
  }));
}

export async function insertSeries(series: Series): Promise<void> {
  await change((ledger) =>
    ledger.series.some((item) => item.id === series.id)
      ? ledger
      : { ...ledger, series: [...ledger.series, series] },
  );
}

export async function updateSeries(series: Series): Promise<void> {
  await change((ledger) => ({ ...ledger, series: ledger.series.map((item) => item.id === series.id ? series : item) }));
}

export async function deleteSeries(id: string): Promise<void> {
  await change((ledger) => ({
    ...ledger,
    series: ledger.series.filter((item) => item.id !== id),
    // A settlement whose rule is gone is still money that moved, but it no longer settles anything:
    // leaving `settlesDate` behind would keep a key pointing at a series that cannot produce it.
    entries: ledger.entries.map((item) => item.seriesId === id ? { ...item, seriesId: null, settlesDate: null } : item),
    // A deferral is a statement about an occurrence of this rule, so it dies with the rule. Left
    // behind it would be worse than orphaned: recreating a series under the same id would resurrect
    // occurrences moved by a decision the owner made about something they deleted.
    deferrals: ledger.deferrals.filter((item) => item.seriesId !== id),
  }));
}

/**
 * Push one occurrence to a later day, or put it back where the rule always said it was.
 *
 * Written as a replace keyed by `(seriesId, month)` rather than an append, which is what makes it
 * idempotent and therefore safe under `change`'s retry — see that function's note. It is also what
 * makes deferring twice mean "it moved again" rather than "it moved twice": the occurrence has one
 * landing day at a time, and its identity is the month it was always due in.
 *
 * `to` of null lifts the deferral. A day at or before the original is refused the same way, in
 * `landsOn` — this only has the month, so it cannot compare here, and one place deciding it is
 * better than two that might disagree.
 */
export async function deferOccurrence(
  seriesId: string,
  month: string,
  to: string | null,
): Promise<void> {
  await change((ledger) => {
    const rest = ledger.deferrals.filter(
      (item) => !(item.seriesId === seriesId && item.month === month),
    );
    return {
      ...ledger,
      deferrals: to
        ? [...rest, { seriesId, month, to, recordedAt: new Date().toISOString() }]
        : rest,
    };
  });
}

export async function insertEntry(entry: Entry): Promise<void> {
  await change((ledger) =>
    ledger.entries.some((item) => item.id === entry.id)
      ? ledger
      : { ...ledger, entries: [...ledger.entries, entry] },
  );
}

export async function updateEntry(entry: Entry): Promise<void> {
  await change((ledger) => ({ ...ledger, entries: ledger.entries.map((item) => item.id === entry.id ? entry : item) }));
}

export async function deleteEntry(id: string): Promise<void> {
  await change((ledger) => ({ ...ledger, entries: ledger.entries.filter((item) => item.id !== id) }));
}

/**
 * Record an occurrence as settled today, ahead of the day it was due.
 *
 * "Recebi o salário hoje, mas na regra é dia 5." One entry, dated the day the money actually moved,
 * carrying the scheduled day it accounts for — which is what stops the projection from billing it a
 * second time on the 5th, and what makes the next occurrence next month's.
 *
 * Idempotent by identity rather than by hope: if something already settles this occurrence, the
 * write is dropped. Two taps on the same forecast would otherwise leave one entry settling it and a
 * second settling nothing, which reads as money that arrived twice.
 */
export async function settleOccurrence(
  seriesId: string,
  scheduled: string,
  entry: Omit<Entry, 'seriesId' | 'settlesDate' | 'recordedAt'>,
): Promise<void> {
  await change((ledger) => {
    const taken = ledger.entries.some(
      (item) => item.seriesId === seriesId && (item.settlesDate ?? item.date) === scheduled,
    );
    if (taken) return ledger;
    return {
      ...ledger,
      series: ledger.series.map((item) =>
        item.id === seriesId && item.kind === 'debt' && item.totalCount != null
          ? { ...item, paidCount: Math.min(item.totalCount, item.paidCount + 1) }
          : item,
      ),
      // Stamped here rather than by the caller, so every settlement in the app carries the same
      // clock and no screen can forget it. This is the moment the payment became known — the one
      // fact a shared debt can show that `date` cannot, because `date` is backdatable.
      entries: [
        ...ledger.entries,
        { ...entry, seriesId, settlesDate: scheduled, recordedAt: new Date().toISOString() },
      ],
    };
  });
}

/**
 * Set, change or lift a ceiling.
 *
 * One call for all three, because to the owner they are one thing — a number next to a category
 * that is either there or not. `capCents` of zero lifts it: a ceiling of nothing is not a budget of
 * nothing, it is the absence of a budget, and keeping a zero row around would make every screen
 * carry a special case for it.
 *
 * Written as a replace rather than an append, so it is idempotent by category — which is what lets
 * `change` retry it after a lost answer.
 */
export async function setCap(category: string, capCents: number): Promise<void> {
  await change((ledger) => {
    const rest = ledger.caps.filter((c) => c.category !== category);
    return { ...ledger, caps: capCents > 0 ? [...rest, { category, capCents }] : rest };
  });
}

/**
 * Dress a category, or undress it.
 *
 * One call, like `setCap`, and for the same reason: to the owner this is a single thing that is
 * either customised or not. Passing `null` removes the row and the category falls back to the look
 * assigned from its name — which is a real state worth being able to return to, not a deletion. The
 * category itself cannot be deleted here at all, because it is not stored: it exists as long as a
 * lançamento or a rule mentions it, and removing it would mean rewriting their history.
 *
 * Replace-by-name rather than append, so a retry after a lost answer is a no-op instead of a
 * duplicate.
 */
export async function setCategory(name: string, look: Omit<Category, 'name'> | null): Promise<void> {
  const key = name.trim().toLocaleLowerCase('pt-BR');
  if (!key) return;
  await change((ledger) => {
    const rest = ledger.categories.filter((c) => c.name.trim().toLocaleLowerCase('pt-BR') !== key);
    return {
      ...ledger,
      categories: look ? [...rest, { name: name.trim(), ...look }] : rest,
    };
  });
}

/**
 * Rename a category everywhere it appears.
 *
 * The name is the key — it is what every entry and every rule stores — so a rename is a migration
 * across the whole document, not a field edit. Done in one `change` so it is one write and one
 * transaction: a rename that updated the entries but not the ceiling would silently orphan a budget
 * the owner still believes is running.
 */
export async function renameCategory(from: string, to: string): Promise<void> {
  const key = from.trim().toLocaleLowerCase('pt-BR');
  const next = to.trim();
  if (!key || !next || key === next.toLocaleLowerCase('pt-BR')) return;
  const matches = (value: string) => value.trim().toLocaleLowerCase('pt-BR') === key;
  await change((ledger) => ({
    ...ledger,
    entries: ledger.entries.map((e) => (matches(e.category) ? { ...e, category: next } : e)),
    series: ledger.series.map((s) => (matches(s.category) ? { ...s, category: next } : s)),
    caps: ledger.caps.map((c) => (matches(c.category) ? { ...c, category: next } : c)),
    categories: ledger.categories.map((c) => (matches(c.name) ? { ...c, name: next } : c)),
  }));
}
