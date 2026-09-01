import * as Crypto from 'expo-crypto';
import { googleConfigured, appleConfigured } from './config';
import type { Provider, Session } from './session';

export class AuthError extends Error {}

/**
 * Every sign-in path in the app goes through this interface. Fase 1 ships the local implementation;
 * when the Google client ID lands (BLOCKERS.md B1) only `withGoogle` changes, and no screen does.
 */
export interface AuthProvider {
  withPassword(email: string, password: string): Promise<Session>;
  register(name: string, email: string, password: string): Promise<Session>;
  withGoogle(): Promise<Session>;
  withApple(): Promise<Session>;
  requestPasswordReset(email: string): Promise<void>;
}

function nameFromEmail(email: string) {
  const local = email.split('@')[0] ?? 'você';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function mint(email: string, name: string, provider: Provider): Promise<Session> {
  return {
    id: Crypto.randomUUID(),
    name,
    email: email.trim().toLowerCase(),
    provider,
    createdAt: Date.now(),
  };
}

/** Latency the real network calls will have, so the loading states are designed against truth. */
const settle = (ms = 620) => new Promise((r) => setTimeout(r, ms));

export const localAuth: AuthProvider = {
  async withPassword(email, password) {
    await settle();
    if (password.length < 8) throw new AuthError('E-mail ou senha incorretos.');
    return mint(email, nameFromEmail(email), 'password');
  },

  async register(name, email, _password) {
    await settle();
    return mint(email, name.trim(), 'password');
  },

  async withGoogle() {
    await settle(420);
    if (!googleConfigured()) {
      // Deliberate: the button is real, the backend is not wired yet. Fail loudly, not silently.
      throw new AuthError('Login com Google ainda não está configurado neste build.');
    }
    throw new AuthError('Fluxo Google indisponível.');
  },

  async withApple() {
    await settle(240);
    if (!appleConfigured()) {
      throw new AuthError('Entrar com Apple só funciona em iPhone e iPad.');
    }
    throw new AuthError('Fluxo Apple indisponível.');
  },

  async requestPasswordReset(_email) {
    await settle(520);
  },
};
