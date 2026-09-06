import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Press } from '@/ui/Press';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useSnackbar } from '@/ui/Snackbar';
import { useLedger } from '@/state/ledger';
import { alertsFor } from '@/domain/alerts';
import { dayKey } from '@/domain/projection';
import {
  capability,
  pending,
  readNotificationSettings,
  request,
  reschedule,
  saveNotificationSettings,
  silence,
  testFire,
  type Capability,
  type NotificationLevel,
  type NotificationSettings,
} from '@/lib/notify';

const LEVELS: { key: NotificationLevel; title: string; body: string }[] = [
  { key: 'essential', title: 'Essencial', body: 'Só aviso quando seu saldo pode ficar negativo, ou quando um teto não vai chegar ao fim do mês.' },
  { key: 'planning', title: 'Planejamento', body: 'Também aviso no fechamento de uma fatura relevante.' },
  { key: 'complete', title: 'Completo', body: 'Inclui o resumo dos compromissos que vencem amanhã.' },
];

export default function Notificacoes() {
  return <Screen><NotificationBody /></Screen>;
}

function NotificationBody() {
  const snack = useSnackbar();
  const accounts = useLedger((state) => state.accounts);
  const entries = useLedger((state) => state.entries);
  const series = useLedger((state) => state.series);
  const [settings, setSettings] = useState<NotificationSettings>({ enabled: false, level: 'essential' });
  const [available, setAvailable] = useState<Capability>('unknown');
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);

  const alerts = useMemo(
    () => alertsFor(accounts, entries, series, dayKey(new Date())),
    [accounts, entries, series],
  );

  const refresh = useCallback(async () => {
    const [nextSettings, nextCapability] = await Promise.all([readNotificationSettings(), capability()]);
    setSettings(nextSettings);
    setAvailable(nextCapability);
    setQueued(nextCapability === 'full' ? (await pending()).filter((item) => item.id !== 'otto.test').length : 0);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const choose = async (level: NotificationLevel) => {
    if (busy) return;
    const next = { ...settings, level };
    setSettings(next);
    await saveNotificationSettings(next);
    if (next.enabled && available === 'full') {
      setBusy(true);
      try {
        const count = await reschedule(alerts);
        setQueued(count);
        snack(`Nível atualizado. ${count ? `${count} aviso${count === 1 ? '' : 's'} programado${count === 1 ? '' : 's'}.` : 'Nada precisa de atenção agora.'}`, 'info');
      } finally { setBusy(false); }
    }
  };

  const activate = async () => {
    if (busy || available === 'no-device') return;
    setBusy(true);
    try {
      const nextCapability = available === 'full' ? 'full' : await request();
      setAvailable(nextCapability);
      if (nextCapability !== 'full') {
        snack(nextCapability === 'denied' ? 'A permissão está bloqueada nas configurações do aparelho.' : 'Este ambiente não consegue agendar avisos.', 'error');
        return;
      }
      const next = { ...settings, enabled: true };
      await saveNotificationSettings(next);
      setSettings(next);
      const count = await reschedule(alerts);
      setQueued(count);
      snack(count ? `Avisos ativos. ${count} programado${count === 1 ? '' : 's'}.` : 'Avisos ativos. Nada precisa de atenção agora.', 'info');
    } finally { setBusy(false); }
  };

  const pause = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = { ...settings, enabled: false };
      await saveNotificationSettings(next);
      await silence();
      setSettings(next);
      setQueued(0);
      snack('Avisos pausados neste aparelho.', 'info');
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <BackBar onPress={() => router.back()} />
      <View style={styles.heading}>
        <Txt variant="title" f="sansSemibold">Avisos inteligentes</Txt>
        <Txt variant="body" t="muted" style={styles.intro}>
          OTTO só interrompe quando existe algo útil para você decidir.
        </Txt>
      </View>

      <Section label="seu nível de atenção" />
      {LEVELS.map((level) => {
        const selected = settings.level === level.key;
        return (
          <Press
            key={level.key}
            onPress={() => void choose(level.key)}
            disabled={busy || available === 'no-device'}
            haptic="light"
            scale={0.99}
            style={[styles.level, selected ? styles.levelSelected : null]}
            accessibilityLabel={`${level.title}. ${level.body}`}
            accessibilityState={{ selected }}
          >
            <View style={styles.levelCopy}>
              <Txt variant="body" f={selected ? 'sansSemibold' : 'sans'}>{level.title}</Txt>
              <Txt variant="micro" t="faint" style={styles.levelBody}>{level.body}</Txt>
            </View>
            <View style={[styles.levelMark, { backgroundColor: selected ? color.ink : color.hairlineStrong }]} />
          </Press>
        );
      })}

      <Txt variant="micro" t="faint" style={styles.note}>
        Você pode mudar o nível ou pausar tudo a qualquer momento. Não enviamos propaganda nem lembretes vazios.
      </Txt>

      <Section label="permissão e fila" />
      {available === 'no-device' ? (
        <Status title="Este ambiente não agenda avisos." body="Abra o OTTO em um aparelho físico para ativar as notificações." />
      ) : available === 'denied' ? (
        <>
          <Status title="A permissão está bloqueada." body="O nível está salvo; falta liberar os avisos nas configurações do aparelho." />
          <Press onPress={() => void Linking.openSettings()} style={styles.textAction} accessibilityLabel="Abrir configurações do aparelho">
            <Txt variant="body" t="muted">Abrir configurações do aparelho</Txt>
          </Press>
        </>
      ) : settings.enabled && available === 'full' ? (
        <>
          <Status title="Avisos ativos neste aparelho." body={queued ? `${queued} ${queued === 1 ? 'aviso está programado' : 'avisos estão programados'} agora.` : 'Nada precisa da sua atenção agora.'} />
          <Press
            onPress={() => void testFire().then((ok) => snack(ok ? 'Feche o app: o teste chega em 5 segundos.' : 'Não consegui agendar o teste.', ok ? 'info' : 'error'))}
            disabled={busy}
            style={styles.textAction}
            accessibilityLabel="Testar um aviso"
          >
            <Txt variant="body" t="muted">Testar um aviso</Txt>
          </Press>
          <Press onPress={() => void pause()} disabled={busy} style={styles.textAction} accessibilityLabel="Pausar todos os avisos">
            <Txt variant="body" t="negative">Pausar todos os avisos</Txt>
          </Press>
        </>
      ) : (
        <>
          <Status title="Ainda não pedimos permissão." body="Quando você ativar, o Android confirma a sua escolha uma única vez." />
          <Press onPress={() => void activate()} disabled={busy} haptic="light" style={styles.primary} accessibilityLabel="Permitir e ativar avisos">
            <Txt variant="body" f="sansSemibold" t="onInk">Permitir e ativar</Txt>
          </Press>
        </>
      )}
    </ScrollView>
  );
}

function Section({ label }: { label: string }) {
  return <View style={styles.section}><View style={styles.rule} /><Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>{label.toUpperCase()}</Txt></View>;
}

function Status({ title, body }: { title: string; body: string }) {
  return <View style={styles.status}><Txt variant="body">{title}</Txt><Txt variant="micro" t="faint" style={styles.statusBody}>{body}</Txt></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, scroll: { paddingTop: space.sm, paddingBottom: space.xxxl },
  heading: { paddingTop: space.lg }, intro: { paddingTop: space.xs },
  section: { paddingTop: space.xxl }, rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  sectionLabel: { letterSpacing: 0.8, paddingTop: space.md },
  level: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  levelSelected: { backgroundColor: color.surface }, levelCopy: { flex: 1, paddingHorizontal: space.md }, levelBody: { paddingTop: 2 },
  levelMark: { width: 18, height: 2, borderRadius: 1, marginRight: space.md }, note: { paddingTop: space.md },
  status: { paddingTop: space.md }, statusBody: { paddingTop: space.xs },
  primary: { alignItems: 'center', backgroundColor: color.ink, marginTop: space.lg, paddingHorizontal: space.lg },
  textAction: { paddingTop: space.lg },
});
