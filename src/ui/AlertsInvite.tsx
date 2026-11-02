import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import * as SecureStore from '@/lib/secure-storage';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { rowIn, rowOut } from '@/theme/motion';
import { capability, planFor, readNotificationSettings, request, reschedule } from '@/lib/notify';
import { useLedger } from '@/state/ledger';
import { Button } from './Button';
import { Press } from './Press';
import { useSnackbar } from './Snackbar';

const DISMISSED = 'otto.alerts-invite.dismissed.v1';

/**
 * The one place that asks for notifications, at the moment it makes sense to.
 *
 * Avisos were reachable only through Ajustes → Avisos, behind a permission nobody had been asked
 * for, so an owner could use the app every day for months and never hear from it. This asks on the
 * Home — where the month is — says in one line what the messages are, and takes no for an answer:
 * "agora não" hides it for good, and the switch stays in Ajustes.
 */
export function AlertsInvite() {
  const snack = useSnackbar();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [settings, c, dismissed] = await Promise.all([
        readNotificationSettings(),
        capability(),
        SecureStore.getItemAsync(DISMISSED).catch(() => null),
      ]);
      if (alive) setShow(settings.enabled && (c === 'unknown' || c === 'denied') && !dismissed);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const c = await request();
      if (c !== 'full') {
        snack('Sem a permissão o OTTO não consegue avisar. Dá para liberar em Ajustes → Avisos.', 'error');
        return;
      }
      const s = useLedger.getState();
      const count = await reschedule(planFor(s));
      setShow(false);
      snack(count ? `Avisos ligados. ${count} já estão programados.` : 'Avisos ligados.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    setShow(false);
    void SecureStore.setItemAsync(DISMISSED, '1').catch(() => {});
  };

  return (
    <Animated.View entering={rowIn} exiting={rowOut} style={styles.block}>
      <View style={styles.rule} />
      <Txt variant="heading" f="sansSemibold" style={styles.title}>
        Deixe o OTTO te avisar
      </Txt>
      <Txt variant="body" t="muted" style={styles.body}>
        Na véspera de cada conta, quando o mês aperta, quando entra dinheiro e quando está tudo bem.
      </Txt>
      <View style={styles.actions}>
        <Button label="Ligar avisos" onPress={() => void enable()} loading={busy} disabled={busy} />
        <Press onPress={later} style={styles.later} accessibilityLabel="Agora não">
          <Txt variant="label" t="muted" center>
            Agora não
          </Txt>
        </Press>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  block: { paddingTop: space.xxl },
  rule: { height: 1, backgroundColor: color.hairlineStrong, marginBottom: space.lg },
  title: { paddingBottom: space.xs },
  body: { paddingBottom: space.lg },
  actions: { gap: space.xs },
  later: { minHeight: 48, justifyContent: 'center' },
});
