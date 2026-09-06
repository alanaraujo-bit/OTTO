import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useSession } from '@/lib/auth/session';
import { useLock } from '@/lib/auth/lock';

/**
 * The gate.
 *
 * This route is only ever hit on a cold start, which is exactly the scope the trinco claims in
 * ajustes and exactly what its caption says out loud: opening the app from nothing asks; coming back
 * from another app does not. A lock whose copy over-promises is worse than no lock, so the label and
 * the gate were decided together.
 *
 * Nothing is decided until the probe has answered. Rendering a redirect from an unread preference
 * would send the owner to the ledger for a frame and then yank it back — or, worse, quietly skip a
 * lock they had switched on.
 */
export default function Index() {
  const session = useSession((s) => s.session);

  const ready = useLock((s) => s.ready);
  const enabled = useLock((s) => s.enabled);
  const unlocked = useLock((s) => s.unlocked);
  const probe = useLock((s) => s.probe);

  useEffect(() => {
    void probe();
  }, [probe]);

  if (!session) return <Redirect href="/sign-in" />;
  if (!ready) return null;
  if (enabled && !unlocked) return <Redirect href="/desbloquear" />;
  return <Redirect href="/home" />;
}
