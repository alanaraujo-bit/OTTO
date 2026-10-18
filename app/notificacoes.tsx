import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
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

/*
 * One voice (NOT-02): the owner is "você", OTTO is spoken of impersonally. These read as "eu aviso"
 * in one line and "não enviamos" in the next — two narrators on one screen, neither of them OTTO.
 */
const LEVELS: { key: NotificationLevel; title: string; body: string }[] = [
  { key: 'essential', title: 'Essencial', body: 'Só quando seu saldo pode ficar negativo, ou quando um teto não chega ao fim do mês.' },
  { key: 'planning', title: 'Planejamento', body: 'Também quando fecha uma fatura que pesa no mês.' },
  { key: 'complete', title: 'Completo', body: 'Também o resumo dos compromissos que vencem amanhã.' },
];

export default function Notificacoes() {
  return <Screen><NotificationBody /></Screen>;
}

function NotificationBody() {
  const snack = useSnackbar();
  const accounts = useLedger((state) => state.accounts);
  const entries = useLedger((state) => state.entries);
  const series = useLedger((state) => state.series);
  const deferrals = useLedger((state) => state.deferralsBySlot);
  const [settings, setSettings] = useState<NotificationSettings>({ enabled: false, level: 'essential' });
  const [available, setAvailable] = useState<Capability>('unknown');
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);

  const alerts = useMemo(
    () => alertsFor(accounts, entries, series, dayKey(new Date()), deferrals),
    [accounts, entries, series, deferrals],
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
      {/*
        A radio group, drawn as one (NOT-01): a ring that fills for the chosen level, on the left
        where the eye starts the row, and no raised card behind it. The old marker was a short
        dash that only changed shade, inside a `surface` box that broke the ledger's no-cards rule.
      */}
      <View accessibilityRole="radiogroup">
        {LEVELS.map((level) => {
          const selected = settings.level === level.key;
          return (
            <Press
              key={level.key}
              onPress={() => void choose(level.key)}
              disabled={busy || available === 'no-device'}
              haptic="light"
              scale={0.99}
              style={styles.level}
              accessibilityLabel={`${level.title}. ${level.body}`}
              accessibilityState={{ selected }}
            >
              <View style={[styles.radio, selected ? styles.radioOn : null]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.levelCopy}>
                <Txt variant="body" f={selected ? 'sansMedium' : 'sans'} t={selected ? 'ink' : 'muted'}>
                  {level.title}
                </Txt>
                <Txt variant="micro" t="faint" style={styles.levelBody}>{level.body}</Txt>
              </View>
            </Press>
          );
        })}
      </View>

      <Txt variant="micro" t="faint" style={styles.note}>
        Você pode mudar o nível ou pausar tudo a qualquer momento. Nada de propaganda nem lembretes vazios.
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
            onPress={() => void testFire().then((ok) => snack(ok ? 'Feche o app: o teste chega em 5 segundos.' : 'Não foi possível agendar o teste.', ok ? 'info' : 'error'))}
            disabled={busy}
            style={styles.textAction}
            accessibilityLabel="Testar um aviso"
          >
            <Txt variant="body" t="muted">Testar um aviso</Txt>
          </Press>
          <Press onPress={() => void pause()} disabled={busy} style={styles.textAction} accessibilityLabel="Pausar todos os avisos">
            {/* Pausing is reversible and loses nothing, so it is not drawn as a destructive act. */}
            <Txt variant="body" t="muted">Pausar todos os avisos</Txt>
          </Press>
        </>
      ) : (
        <>
          <Status title="Os avisos ainda estão desligados." body="Ao ativar, o Android pede a sua confirmação uma única vez." />
          <View style={styles.primary}>
            <Button label="Permitir e ativar" onPress={() => void activate()} disabled={busy} loading={busy} />
          </View>
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
  level: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.hairline },
  levelCopy: { flex: 1 }, levelBody: { paddingTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: color.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: color.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.ink },
  note: { paddingTop: space.md },
  status: { paddingTop: space.md }, statusBody: { paddingTop: space.xs },
  primary: { marginTop: space.lg },
  textAction: { paddingTop: space.lg },
});
