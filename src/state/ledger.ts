import { create } from 'zustand';
import { readLedger } from '@/db/repo';
import { seed } from '@/db/seed';
import type { Account, Entry, Series } from '@/domain/model';
import type { Cap } from '@/domain/cap';
import type { Category } from '@/domain/category';
import { alertsFor } from '@/domain/alerts';
import { dayKey } from '@/domain/projection';
import { reschedule } from '@/lib/notify';

interface LedgerState {
  ready: boolean;
  /** Set when the database itself failed. The screen says so rather than showing a confident zero. */
  error: string | null;
  accounts: Account[];
  series: Series[];
  entries: Entry[];
  caps: Cap[];
  categories: Category[];
  load: () => Promise<void>;
  reseed: () => Promise<void>;
}

/**
 * The ledger, held in memory.
 *
 * Railway PostgreSQL is the durable store; this is the working copy the screens read from. For one owner the
 * whole ledger is a few hundred rows, so holding it is cheaper than a query per component and makes
 * every derivation a pure function over plain arrays — no loading state inside a chart.
 *
 * A read that fails must never resolve to empty arrays. Zero and "we could not tell" look identical
 * on a balance, and only one of them is safe to act on.
 */
export const useLedger = create<LedgerState>((set, get) => ({
  ready: false,
  error: null,
  accounts: [],
  series: [],
  entries: [],
  caps: [],
  categories: [],

  load: async () => {
    try {
      const ledger = await readLedger();
      set({ ...ledger, ready: true, error: null });

      /*
       * Anything scheduled to be said is derived from this ledger, so it is restated every time the
       * ledger is. A lançamento moves the curve; an alert queued before it would be a figure the
       * app would contradict the moment the owner opened it — which is the one thing a
       * notification must never be.
       *
       * Fire-and-forget on purpose: this is the read path every screen awaits on mount, and no
       * screen should wait on the notification service to draw a balance. It is also a no-op unless
       * the owner has actually turned alerts on — `reschedule` checks the capability first.
       */
      void reschedule(
        alertsFor(ledger.accounts, ledger.entries, ledger.series, dayKey(new Date()), ledger.caps),
      )
        .catch(() => {
          // A scheduler that will not answer must never take the ledger down with it.
        });
    } catch (e) {
      set({ ready: true, error: e instanceof Error ? e.message : 'Falha ao ler o banco.' });
    }
  },

  reseed: async () => {
    set({ ready: false });
    await seed();
    await get().load();
  },
}));
