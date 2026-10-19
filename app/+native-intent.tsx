/**
 * Google's sign-in redirect (`com.alanaraujo.otto:/oauthredirect?code=…`) is answered by
 * expo-auth-session's own listener in `withGoogle`. Handed to the router as well, it would push
 * "Unmatched Route" over the sign-in screen for the moment before the session lands — so the router
 * is told to ignore it. Every other link passes through untouched.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes('oauthredirect') ? null : path;
}
