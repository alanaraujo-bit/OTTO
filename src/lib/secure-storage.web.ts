/**
 * The browser's answer to the keystore — for the dev server, and for the shared-debt page that the
 * web build exists to serve.
 *
 * `localStorage` is not a keystore and this file does not pretend otherwise: a token kept here is
 * readable by any script on the page, where the native one sits behind the device's own hardware.
 * That trade is deliberate and it is bounded — it applies only to the web build, and the native
 * app never loads this file. What it buys is a browser that can actually hold a session, which is
 * what makes the app testable outside a handset at all.
 *
 * Every access is guarded twice. `window` is absent while `expo export` prerenders these routes into
 * static HTML, and `localStorage` itself throws rather than returning null when the browser is set
 * to block site data — so a private window degrades to a session that simply does not persist,
 * which is the same shape of failure `hydrate` was already written to survive.
 */
function store(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  try {
    store()?.setItem(key, value);
  } catch {
    // A full or locked-down store is not a reason to fail a sign-in that the server already
    // granted. The session stays in memory for this tab and is gone on reload — degraded, not lost.
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing to undo: if the store cannot be reached, there is nothing in it to remove.
  }
}
