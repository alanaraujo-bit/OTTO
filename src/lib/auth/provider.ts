import { googleConfigured, appleConfigured } from './config';
import type { Session } from './session';
import { api } from '@/lib/api';

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

function session(value: Session): Session {
  if (!value.accessToken) throw new AuthError('Resposta de autenticação inválida.');
  return value;
}

export const localAuth: AuthProvider = {
  async withPassword(email, password) {
    try {
      return session(await api<Session>('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false));
    } catch (error) {
      throw new AuthError(error instanceof Error ? error.message : 'Não foi possível entrar.');
    }
  },

  async register(name, email, password) {
    try {
      return session(await api<Session>('/v1/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }, false));
    } catch (error) {
      throw new AuthError(error instanceof Error ? error.message : 'Não foi possível criar a conta.');
    }
  },

  async withGoogle() {
    if (!googleConfigured()) {
      // Deliberate: the button is real, the backend is not wired yet. Fail loudly, not silently.
      throw new AuthError('Login com Google ainda não está configurado neste build.');
    }
    throw new AuthError('Fluxo Google indisponível.');
  },

  async withApple() {
    if (!appleConfigured()) {
      throw new AuthError('Entrar com Apple só funciona em iPhone e iPad.');
    }
    throw new AuthError('Fluxo Apple indisponível.');
  },

  async requestPasswordReset(_email) {
    throw new AuthError('Recuperação de senha ainda não está habilitada.');
  },
};
