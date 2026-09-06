import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Wordmark } from '@/ui/Wordmark';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';
import { useLock } from '@/lib/auth/lock';
import { useSession } from '@/lib/auth/session';

const ENTER = { delay: 40, step: 78, cap: 3, rise: 12 } as const;

/**
 * The door.
 *
 * The mark is shut here, and that is the whole screen: this is the state the trinco in ajustes
 * describes, arrived at for real. The eyes open when the sensor answers, and the app is behind them.
 *
 * The prompt fires on its own, once, on arrival — asking the owner to press a button that then asks
 * the OS to ask them again is a step that exists only because the screen was built around a button.
 * If they dismiss it, the button is there.
 *
 * **There is always a way out that does not need the sensor.** Enrolment can be removed from the OS
 * after the trinco was switched on, and a fingerprint the phone no longer knows would otherwise make
 * this a door with no handle on either side. Signing out clears the session and lands on sign-in,
 * which costs the owner a login and never costs them their ledger — the database is untouched.
 */
export default function Desbloquear() {
  const session = useSession((s) => s.session);
  const unlock = useLock((s) => s.unlock);
  const biometry = useLock((s) => s.biometry);
  const signOut = useSession((s) => s.signOut);

  const [asking, setAsking] = useState(true);
  const [refused, setRefused] = useState(false);
  /** Strict Mode mounts effects twice in dev; two prompts stacked read as the sensor glitching. */
  const fired = useRef(false);

  const ask = async () => {
    setAsking(true);
    const ok = await unlock();
    if (ok) {
      router.replace('/home');
      return;
    }
    setAsking(false);
    setRefused(true);
  };

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void ask();
    // Runs once on arrival, by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A route is a route: expo-router will mount this one on a deep link with no session behind it,
  // and a door in front of an empty room is just a wall.
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Screen>
      <View style={styles.body}>
        <Reveal index={0} {...ENTER} rise={0}>
          <Wordmark height={40} alive mood="guard" />
        </Reveal>

        <Reveal index={1} {...ENTER}>
          <Txt variant="heading" f="sansSemibold" style={styles.head}>
            OTTO está de olhos fechados.
          </Txt>
          <Txt variant="body" t="muted" style={styles.sub}>
            {refused
              ? 'Não consegui confirmar que é você.'
              : `${biometry?.name ?? 'Biometria'} para abrir seu razão.`}
          </Txt>
        </Reveal>

        <Reveal index={2} {...ENTER} style={styles.actions}>
          <Button
            label={refused ? 'Tentar de novo' : 'Desbloquear'}
            onPress={() => void ask()}
            loading={asking}
          />
          {/*
            The handle on the inside. Only offered once the sensor has actually refused, so it is
            not a shortcut past the lock — it is the answer to "the sensor will not let me in", and
            the ledger survives it untouched.
          */}
          {refused ? (
            <Press
              onPress={() => {
                void signOut();
                router.replace('/sign-in');
              }}
              style={styles.exit}
              accessibilityLabel="Sair da conta"
            >
              <Txt variant="label" t="faint" center>
                Sair da conta
              </Txt>
            </Press>
          ) : null}
        </Reveal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingBottom: space.xxxl },
  head: { paddingTop: space.xxl },
  sub: { paddingTop: space.sm },
  actions: { paddingTop: space.xxl },
  exit: { paddingTop: space.xl },
});
