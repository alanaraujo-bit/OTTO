import * as SecureStore from '@/lib/secure-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { create } from 'zustand';

const KEY = 'otto.lock.v1';

export interface Biometry {
  /** The sensor exists. */
  hardware: boolean;
  /**
   * Something is actually enrolled. A phone can have a fingerprint reader with no fingerprint on
   * it, and a lock that cannot authenticate is a lock that only locks the owner out.
   */
  enrolled: boolean;
  /** What this device calls it, so the copy uses the owner's own words. */
  name: string;
}

interface LockState {
  /** The probe has answered. Until then the row shows nothing rather than guessing. */
  ready: boolean;
  /** The owner's choice, read back from the store. */
  enabled: boolean;
  biometry: Biometry | null;
  /**
   * Cleared for this launch. The gate is on cold start only — see `app/desbloquear.tsx` — so this
   * lives in memory and dies with the process, which is exactly the lifetime it should have.
   */
  unlocked: boolean;

  probe: () => Promise<void>;
  /** Asks for the fingerprint *before* storing the preference: a lock proves itself once first. */
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  unlock: () => Promise<boolean>;
}

/**
 * Confirms an irreversible server operation with an enrolled biometric only. Unlike the app lock,
 * this intentionally does not fall back to a device PIN: the owner explicitly asked for a digital
 * confirmation before data is deleted.
 */
export async function confirmDestructiveAction(prompt: string): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      promptDescription: 'Confirme a exclusão com sua biometria.',
      cancelLabel: 'Cancelar',
      disableDeviceFallback: true,
      biometricsSecurityLevel: 'strong',
      requireConfirmation: true,
    });
    return result.success;
  } catch {
    return false;
  }
}

/**
 * The trinco.
 *
 * The one setting in this app that changes what the app *does* rather than how it looks, so it is
 * the one that has to be true. A toggle that stores a preference and gates nothing is a control
 * naming an action it cannot perform, which `TabBar` already refuses to draw; this one really does
 * stand between a cold start and the ledger.
 *
 * Two guarantees, both about not locking the owner out of their own money:
 *  - Enabling requires a successful authentication first. If the sensor will not answer now it will
 *    not answer at launch either, and finding that out later means finding it out locked.
 *  - The lock screen always offers a way out that does not need the sensor. Enrolment can be removed
 *    from the OS after this is switched on, and a ledger nobody can open is worse than no lock.
 */
export const useLock = create<LockState>((set) => ({
  ready: false,
  enabled: false,
  biometry: null,
  unlocked: false,

  probe: async () => {
    try {
      const [hardware, enrolled, types, stored] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
        SecureStore.getItemAsync(KEY),
      ]);

      set({
        ready: true,
        // A stored `true` on a device that can no longer authenticate is not honoured. The escape
        // hatch is not enough on its own: the lock should simply stop being a lock the moment it
        // cannot do its job.
        enabled: stored === '1' && hardware && enrolled,
        biometry: { hardware, enrolled, name: label(types) },
      });
    } catch {
      // The probe failing is not a reason to hold the door shut.
      set({ ready: true, enabled: false, biometry: { hardware: false, enrolled: false, name: 'Biometria' } });
    }
  },

  enable: async () => {
    const ok = await attempt('Confirme para ligar o trinco');
    if (!ok) return false;
    await SecureStore.setItemAsync(KEY, '1');
    set({ enabled: true, unlocked: true });
    return true;
  },

  disable: async () => {
    await SecureStore.deleteItemAsync(KEY);
    set({ enabled: false, unlocked: true });
  },

  unlock: async () => {
    const ok = await attempt('Desbloqueie o OTTO');
    if (ok) set({ unlocked: true });
    return ok;
  },

}));

async function attempt(prompt: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'Cancelar',
      // The device passcode stays available: it is the owner's own fallback, and refusing it would
      // make a wet finger a reason to be locked out.
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}

/** The device's own word for its sensor. Guessing "digital" on a face-unlock phone reads as a bug. */
function label(types: LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
    return 'Reconhecimento facial';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'Impressão digital';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'Íris';
  return 'Biometria';
}
