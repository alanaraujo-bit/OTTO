/**
 * Where the trinco stands, decided from the route alone.
 *
 * The lock used to be checked in exactly one place — `app/index.tsx` — which is the route a cold
 * start from the launcher lands on and no other way in does. `otto://home`, an `https://…/divida/…`
 * link and a notification tap all mount their own route directly, so each of them opened the ledger
 * with the trinco switched on and nobody asked. This is the rule `LockGate` applies to every route
 * instead, kept free of React so `tools/lock-check.mjs` can pin it down.
 *
 * **What stays open, and why.**
 *  - The auth screens: they hold nothing, and the door's own "Sair da conta" lands on one of them.
 *  - `/desbloquear` itself, or the door would lock itself out.
 *  - `/`: the entry route already makes this same decision before it redirects anywhere, and it
 *    renders nothing while it does — gating it here too would only stack a second door on the first.
 *
 * **`/divida/[token]` is guarded when there is a session, and only then.** The page itself shows
 * someone else's share, public to anyone holding the link — on the web it has to be. But on a phone
 * that is signed in, it is a page inside the owner's app: its button writes that debt into their
 * recorrências and lands on them. Signed out there is no ledger behind it to protect, so it stays
 * readable, exactly as it is in a browser.
 */
export type LockDecision = 'open' | 'wait' | 'lock';

export interface LockFacts {
  signedIn: boolean;
  /** The probe has answered — until then the stored preference is unknown. */
  ready: boolean;
  enabled: boolean;
  unlocked: boolean;
}

const OPEN_ROUTES = new Set(['/', '/sign-in', '/sign-up', '/forgot', '/desbloquear']);

export function lockDecision(pathname: string, facts: LockFacts): LockDecision {
  if (OPEN_ROUTES.has(pathname)) return 'open';
  // A lock guards a ledger, and there is none without a session.
  if (!facts.signedIn) return 'open';
  // An unread preference is neither answer: showing the screen for a frame and then yanking it away
  // is the leak, and holding the door forever is the trap. So the screen waits behind the curtain.
  if (!facts.ready) return 'wait';
  return facts.enabled && !facts.unlocked ? 'lock' : 'open';
}

/**
 * The destination to come back to, as one href string.
 *
 * `usePathname` drops the query, and a notification's `/calendario?date=…` without its date is the
 * calendar on the wrong day. The route's own dynamic segments (`[token]`) are already in the path, so
 * they are left out of the query rather than said twice.
 */
export function returnHref(
  pathname: string,
  segments: readonly string[],
  params: Record<string, string | string[] | undefined>,
): string {
  const dynamic = new Set(
    segments.map((s) => /^\[(?:\.\.\.)?(.+)\]$/.exec(s)?.[1]).filter((k): k is string => Boolean(k)),
  );
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (dynamic.has(key) || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const q = query.toString();
  return q ? `${pathname}?${q}` : pathname;
}

/**
 * A `next` worth following after the door opens, or null.
 *
 * It arrives as a route param, and a route param is something a link can set. So only an in-app
 * path is honoured: one leading slash (not `//host`, which a router may read as another origin), no
 * scheme, and never the door itself — unlocking into `/desbloquear` would just ask again.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) return null;
  const path = raw.split('?')[0];
  if (path === '/desbloquear' || path === '/') return null;
  return raw;
}
