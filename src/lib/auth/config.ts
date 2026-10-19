import { Platform } from 'react-native';

/**
 * Google OAuth client IDs, from the Google Cloud project `otto-512100` (Google Auth Platform → Clientes).
 * Not secrets: they ship in every build. `api/src/server.js` keeps the same two in `GOOGLE_CLIENT_IDS`
 * to check the ID token's audience — change both together.
 *
 * The Android client is tied to the package `com.alanaraujo.otto` and the SHA-1 of the key that signs
 * the APK (`android/app/debug.keystore` today). A build signed with any other key gets
 * `invalid_client` / `redirect_uri_mismatch` from Google until that key's SHA-1 is added there too.
 */
export const GOOGLE_OAUTH = {
  androidClientId: '959218506517-uf1lpleu93ta9bijeloqf2o07rbnk9jj.apps.googleusercontent.com',
  webClientId: '959218506517-h4p48s4r5us8fij660l59a37c319f3a1.apps.googleusercontent.com',
} as const;

/** The client for the platform this build runs on. iOS has none, so it draws no Google button. */
export const googleClientId = (): string =>
  Platform.select({ android: GOOGLE_OAUTH.androidClientId, web: GOOGLE_OAUTH.webClientId, default: '' });

export const googleConfigured = () => googleClientId().length > 0;

/**
 * Apple Sign In has no Android SDK; on Android it can only run as a web OAuth flow, which needs a
 * paid Apple Developer membership and a Services ID. See BLOCKERS.md B2.
 */
export const appleConfigured = () => false;
