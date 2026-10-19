import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { googleClientId, googleConfigured, appleConfigured } from './config';
import type { Session } from './session';
import { api } from '@/lib/api';

export class AuthError extends Error {}

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

/** Google's Android OAuth client redirects to the package name as a scheme; app.json lists it. */
const GOOGLE_NATIVE_SCHEME = 'com.alanaraujo.otto';

/**
 * Every sign-in path in the app goes through this interface; no screen knows which provider is real.
 */
export interface AuthProvider {
  withPassword(email: string, password: string): Promise<Session>;
  register(name: string, email: string, password: string): Promise<Session>;
  withGoogle(): Promise<Session>;
  withApple(): Promise<Session>;
  // No password reset: the API has no route for it, and `app/(auth)/forgot.tsx` says so instead.
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

  /*
   * Google answers with an ID token, and the API — not this device — checks it and decides who the
   * owner is (`POST /v1/auth/google`). Android uses the code flow with PKCE, the only one Google allows
   * an installed app without a secret; the web client is confidential, so the browser asks for the ID
   * token directly instead. `SocialRow` is not drawn when `googleConfigured` says no.
   */
  async withGoogle() {
    if (!googleConfigured()) {
      throw new AuthError('Login com Google ainda não está configurado neste build.');
    }
    const web = Platform.OS === 'web';
    const clientId = googleClientId();
    // Native: the package-name scheme registered in app.json. Web: this origin, which the popup reloads.
    const redirectUri = AuthSession.makeRedirectUri({ native: `${GOOGLE_NATIVE_SCHEME}:/oauthredirect` });
    const request = new AuthSession.AuthRequest({
      clientId,
      redirectUri,
      scopes: ['openid', 'email', 'profile'],
      responseType: web ? AuthSession.ResponseType.IdToken : AuthSession.ResponseType.Code,
      usePKCE: !web,
      prompt: AuthSession.Prompt.SelectAccount,
      extraParams: web ? { nonce: Crypto.randomUUID() } : {},
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);
    if (result.type === 'cancel' || result.type === 'dismiss') throw new AuthError('Login com Google cancelado.');
    if (result.type !== 'success') throw new AuthError('O Google não confirmou o login. Tente de novo.');

    let idToken: string | undefined = result.params.id_token;
    try {
      if (!web) {
        if (!result.params.code) throw new AuthError('O Google não confirmou o login. Tente de novo.');
        const tokens = await AuthSession.exchangeCodeAsync(
          { clientId, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
          GOOGLE_DISCOVERY,
        );
        idToken = tokens.idToken;
      }
      if (!idToken) throw new AuthError('O Google não devolveu sua identidade.');
      return session(await api<Session>('/v1/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }, false));
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError(error instanceof Error ? error.message : 'Não foi possível entrar com Google.');
    }
  },

  async withApple() {
    if (!appleConfigured()) {
      throw new AuthError('Entrar com Apple só funciona em iPhone e iPad.');
    }
    throw new AuthError('Fluxo Apple indisponível.');
  },
};
