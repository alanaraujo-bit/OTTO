import { AppState } from 'react-native';
import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { OttoCapture } from '../../modules/otto-capture';
import { insertEntry } from '@/db/repo';
import { BANK_APPS, readBankText, suggestFor, type Detected } from '@/domain/capture';
import { useLedger } from './ledger';

/**
 * The inbox of lançamentos OTTO found on its own.
 *
 * Three ways in, one place out: a bank's notification (kept by the native listener even while the
 * app is closed), a receipt shared into OTTO, and a nota fiscal scanned on its QR. Every item waits
 * here for the owner's yes — nothing found automatically is written to the ledger without it, and
 * the yes is one tap.
 */
interface CaptureState {
  /** Newest first. */
  items: Detected[];
  /** Whether this phone can listen at all (Android, with the module built in). */
  supported: boolean;
  /**
   * Whether this build has the listener. The APK downloaded from the site does not: Android's
   * fraud protection refuses to install a sideloaded app that reads notifications. The Play build
   * does. Sharing receipts and reading notas fiscais work in both.
   */
  canListen: boolean;
  /** Whether the owner has given OTTO access to notifications. */
  listening: boolean;
  refresh: () => void;
  /** A capture from a share or a nota fiscal: it skips the queue and goes straight to the inbox. */
  add: (d: Detected) => void;
  /** Records it with OTTO's suggestion, or with the owner's edits. */
  confirm: (d: Detected, over?: Partial<{ title: string; category: string; accountId: string }>) => Promise<void>;
  /** Takes it out of the inbox, recorded or not. */
  decide: (id: string) => void;
}

/** Captures that did not come from the listener, kept for this session only. */
let extra: Detected[] = [];

export const useCapture = create<CaptureState>((set, get) => ({
  items: [],
  supported: OttoCapture != null,
  canListen: OttoCapture?.hasListener?.() ?? false,
  listening: OttoCapture?.isListenerEnabled() ?? false,

  refresh: () => {
    if (!OttoCapture) {
      set({ items: [...extra] });
      return;
    }
    const raw = OttoCapture.pending();
    const read: Detected[] = [];
    const noise: string[] = [];
    for (const r of raw) {
      const d = readBankText({
        id: r.id,
        source: 'notification',
        bank: BANK_APPS[r.pkg] ?? null,
        title: r.title,
        text: r.text,
        at: new Date(r.postedAt).toISOString(),
      });
      if (d) read.push(d);
      else noise.push(r.id); // kept by the listener's quick filter, refused by the full reading
    }
    if (noise.length) OttoCapture.remove(noise);
    const items = [...extra, ...read].sort((a, b) => (a.at < b.at ? 1 : -1));
    set({ items, listening: OttoCapture.isListenerEnabled() });
  },

  add: (d) => {
    extra = [d, ...extra.filter((x) => x.id !== d.id)];
    get().refresh();
  },

  confirm: async (d, over = {}) => {
    const ledger = useLedger.getState();
    const s = suggestFor(d, ledger.entries, ledger.accounts, ledger.categories);
    const accountId = over.accountId ?? s.accountId;
    if (!accountId) throw new Error('Cadastre uma conta antes de lançar.');
    const at = new Date(d.at);
    const pad = (n: number) => String(n).padStart(2, '0');
    await insertEntry({
      id: Crypto.randomUUID(),
      seriesId: null,
      settlesDate: null,
      date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
      time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
      recordedAt: new Date().toISOString(),
      amountCents: d.amountCents,
      direction: d.direction,
      title: over.title ?? s.title,
      category: over.category ?? s.category,
      accountId,
    });
    get().decide(d.id);
    await ledger.load();
  },

  decide: (id) => {
    extra = extra.filter((x) => x.id !== id);
    OttoCapture?.remove([id]);
    get().refresh();
  },
}));

/**
 * Wires the inbox to the device: tells the listener which apps are banks, refreshes when a capture
 * lands while the app is open, and again whenever the app comes back to the front.
 */
export function startCapture() {
  if (!OttoCapture) return () => {};
  // In a development build the shell can post a stand-in bank notification over adb, which is how
  // the whole path is exercised without a real purchase. Never in a release build.
  OttoCapture.setWatched([...Object.keys(BANK_APPS), ...(__DEV__ ? ['com.android.shell'] : [])]);
  useCapture.getState().refresh();
  const landed = OttoCapture.addListener('onCapture', () => useCapture.getState().refresh());
  const front = AppState.addEventListener('change', (s) => {
    if (s === 'active') useCapture.getState().refresh();
  });
  return () => {
    landed.remove();
    front.remove();
  };
}

/** A fresh id for a capture that did not come from a notification. */
export const captureId = (prefix: string) => `${prefix}:${Crypto.randomUUID()}`;
