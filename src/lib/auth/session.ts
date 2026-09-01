import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'otto.session.v1';

export type Provider = 'password' | 'google' | 'apple';

export interface Session {
  id: string;
  name: string;
  email: string;
  provider: Provider;
  createdAt: number;
}

interface SessionState {
  session: Session | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  signIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ session: raw ? (JSON.parse(raw) as Session) : null, hydrated: true });
    } catch {
      // A corrupt or unreadable store must not lock the owner out of their own device.
      set({ session: null, hydrated: true });
    }
  },

  signIn: async (s) => {
    set({ session: s });
    await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  },

  signOut: async () => {
    set({ session: null });
    await SecureStore.deleteItemAsync(KEY);
  },
}));
