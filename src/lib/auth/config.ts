/**
 * Google OAuth client IDs. Empty until BLOCKERS.md B1 is resolved.
 * When they land here the real flow activates with no UI change.
 */
export const GOOGLE_OAUTH = {
  androidClientId: '',
  webClientId: '',
} as const;

export const googleConfigured = () =>
  GOOGLE_OAUTH.androidClientId.length > 0 || GOOGLE_OAUTH.webClientId.length > 0;

/**
 * Apple Sign In has no Android SDK; on Android it can only run as a web OAuth flow, which needs a
 * paid Apple Developer membership and a Services ID. See BLOCKERS.md B2.
 */
export const appleConfigured = () => false;
