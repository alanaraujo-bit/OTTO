// Mirrors `GOOGLE_OAUTH` in src/lib/auth/config.ts. An ID token is accepted only when Google issued it
// to one of these two clients, so a token minted for some other app cannot sign anyone in here.
export const GOOGLE_CLIENT_IDS = [
  '959218506517-uf1lpleu93ta9bijeloqf2o07rbnk9jj.apps.googleusercontent.com',
  '959218506517-h4p48s4r5us8fij660l59a37c319f3a1.apps.googleusercontent.com',
];

const field = (value, max) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;

/**
 * Google's tokeninfo endpoint checks the signature and expiry; this checks it was meant for OTTO and
 * that Google vouches for the address. Returns `{ sub, email, name }`, or null for anything else.
 * shortcut: one HTTPS round trip per sign-in instead of verifying against Google's JWKS locally — fine
 * at sign-in volume, upgrade if this ever runs per request.
 */
export async function googleIdentity(idToken, fetchImpl = fetch) {
  if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > 4096) return null;
  let claims;
  try {
    const response = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    claims = await response.json();
  } catch { return null; }
  const email = field(claims.email, 254)?.toLowerCase();
  const sub = field(claims.sub, 255);
  if (!GOOGLE_CLIENT_IDS.includes(claims.aud) || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) return null;
  if (!email || !sub || String(claims.email_verified) !== 'true') return null;
  return { sub, email, name: field(claims.name, 140) ?? email.split('@')[0] };
}
