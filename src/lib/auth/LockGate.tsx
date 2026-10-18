import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  router,
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useSegments,
} from 'expo-router';
import { color } from '@/theme/tokens';
import { useLock } from './lock';
import { useSession } from './session';
import { lockDecision, returnHref } from './guard';

/**
 * The trinco on every route, not just the one a launcher tap lands on. See `guard.ts` for the rule.
 *
 * Mounted once in the root layout, beside the stack: whatever route the app was opened on, this
 * sees it. While the route is not cleared it draws a curtain in the ground colour over everything —
 * the tab bar included — so the ledger never shows for the frame between the route mounting and the
 * door replacing it, and nothing under the curtain takes a tap. The door then gets the destination
 * as `next`, which is what lets unlocking land where the owner was going instead of on the Home.
 *
 * The probe runs here as well as in `index.tsx` because a deep link never visits `index`. It is
 * cheap and idempotent: it reads the stored preference and the sensor, and never touches `unlocked`.
 */
export function LockGate() {
  const pathname = usePathname();
  const segments = useSegments();
  const params = useGlobalSearchParams();
  // Navigating before the root navigator has mounted throws; its state having a key means it has.
  const navReady = Boolean(useRootNavigationState()?.key);

  const signedIn = useSession((s) => s.session !== null);
  const ready = useLock((s) => s.ready);
  const enabled = useLock((s) => s.enabled);
  const unlocked = useLock((s) => s.unlocked);
  const probe = useLock((s) => s.probe);

  useEffect(() => {
    void probe();
  }, [probe]);

  const decision = lockDecision(pathname, { signedIn, ready, enabled, unlocked });

  useEffect(() => {
    if (decision !== 'lock' || !navReady) return;
    const next = returnHref(pathname, segments, params);
    router.replace({ pathname: '/desbloquear', params: { next } } as never);
    // `params` and `segments` are new objects on every render; the pathname is what moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision, navReady, pathname]);

  if (decision === 'open') return null;
  return <View style={styles.curtain} />;
}

const styles = StyleSheet.create({
  curtain: { ...StyleSheet.absoluteFill, backgroundColor: color.bg },
});
