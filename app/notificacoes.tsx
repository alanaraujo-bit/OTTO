import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Animated from 'react-native-reanimated';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Latch } from '@/ui/Latch';
import { Reveal } from '@/ui/Reveal';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { listLayout, rowIn, rowOut } from '@/theme/motion';
import { useSnackbar } from '@/ui/Snackbar';
import { useLedger } from '@/state/ledger';
import {
  GROUPS,
  capability,
  pending,
  planFor,
  readNotificationSettings,
  request,
  reschedule,
  saveNotificationSettings,
  silence,
  testFire,
  type AlertGroup,
  type Capability,
  type NotificationSettings,
} from '@/lib/notify';

const ENTER = { delay: 160, step: 70, cap: 6, rise: 10, shift: 26 } as const;

/**
 * Avisos: what OTTO will tell you, and the switches for it.
 *
 * The first version asked for a level — essencial, planejamento, completo — before it had said what
 * any of them would sound like, and the default level said almost nothing. This screen leads with
 * the state in one sentence, then five plain switches named by what the message is *for*, and then
 * the queue itself: the next messages, with their day and words, exactly as they will arrive. A
 * system you can see is one you can trust to be working.
 */
export default function Notificacoes() {
  return (
    <Screen>
      <NotificationBody />
    </Screen>
  );
}

type Queued = Awaited<ReturnType<typeof pending>>[number];

function NotificationBody() {
  const snack = useSnackbar();
  const accounts = useLedger((s) => s.accounts);
  const entries = useLedger((s) => s.entries);
  const series = useLedger((s) => s.series);
  const caps = useLedger((s) => s.caps);
  const deferrals = useLedger((s) => s.deferrals);
  const categories = useLedger((s) => s.categories);

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [available, setAvailable] = useState<Capability>('unknown');
  const [queue, setQueue] = useState<Queued[]>([]);
  const [busy, setBusy] = useState(false);

  const plan = () => planFor({ accounts, entries, series, caps, deferrals, categories });

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([readNotificationSettings(), capability()]);
    setSettings(s);
    setAvailable(c);
    setQueue(c === 'full' && s.enabled ? await pending() : []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = async (next: NotificationSettings) => {
    setSettings(next);
    await saveNotificationSettings(next);
    if (available === 'full') {
      if (next.enabled) await reschedule(plan());
      else await silence();
      setQueue(next.enabled ? await pending() : []);
    }
  };

  const toggle = (group: AlertGroup) => {
    if (!settings || busy) return;
    void apply({ ...settings, groups: { ...settings.groups, [group]: !settings.groups[group] } });
  };

  const activate = async () => {
    if (busy || available === 'no-device' || !settings) return;
    setBusy(true);
    try {
      const c = await request();
      setAvailable(c);
      if (c !== 'full') {
        snack('A permissão está bloqueada. Libere as notificações do OTTO nas configurações do Android.', 'error');
        return;
      }
      const next = { ...settings, enabled: true };
      await saveNotificationSettings(next);
      setSettings(next);
      const count = await reschedule(plan());
      setQueue(await pending());
      snack(count ? `Avisos ligados. ${count} já estão programados.` : 'Avisos ligados.', 'info');
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <BackBar onPress={() => router.back()} />;
  const live = settings.enabled && available === 'full';

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <BackBar onPress={() => router.back()} />
      <Reveal index={0} {...ENTER}>
        <View style={styles.heading}>
          <Txt variant="title" f="sansSemibold">
            Avisos
          </Txt>
          <Txt variant="body" t="muted" style={styles.intro}>
            O OTTO avisa antes de uma conta vencer, quando o mês aperta, quando entra dinheiro e quando está
            tudo bem.
          </Txt>
        </View>
      </Reveal>

      <Reveal index={1} {...ENTER}>
        {available === 'no-device' ? (
          <Status title="Este ambiente não agenda avisos." body="Abra o OTTO num aparelho de verdade para receber notificações." />
        ) : live ? (
          <Status
            title="Avisos ligados neste aparelho."
            body={
              queue.length
                ? `${queue.length} ${queue.length === 1 ? 'aviso programado' : 'avisos programados'} para as próximas três semanas.`
                : 'Nada programado por enquanto.'
            }
          />
        ) : (
          <>
            <Status
              title={available === 'denied' ? 'As notificações do OTTO estão bloqueadas.' : 'Falta só a sua permissão.'}
              body={
                available === 'denied'
                  ? 'Toque abaixo para abrir as configurações do Android e liberar.'
                  : 'O Android pergunta uma vez. Você escolhe abaixo o que quer receber.'
              }
            />
            <View style={styles.primary}>
              <Button
                label={available === 'denied' ? 'Abrir configurações' : 'Ligar avisos'}
                onPress={() => (available === 'denied' ? void Linking.openSettings() : void activate())}
                loading={busy}
                disabled={busy}
              />
            </View>
          </>
        )}
      </Reveal>

      <Reveal index={2} {...ENTER} rise={0}>
        <Section label="o que você quer receber" />
        {GROUPS.map((g) => (
          <Press
            key={g.key}
            onPress={() => toggle(g.key)}
            haptic="light"
            scale={0.995}
            style={styles.row}
            accessibilityLabel={`${g.title}. ${g.body}`}
            accessibilityState={{ selected: settings.groups[g.key] }}
          >
            <View style={styles.rowText}>
              <Txt variant="body" t={settings.groups[g.key] ? 'ink' : 'muted'}>
                {g.title}
              </Txt>
              <Txt variant="micro" t="faint" style={styles.rowBody}>
                {g.body}
              </Txt>
            </View>
            <Latch on={settings.groups[g.key]} />
          </Press>
        ))}
      </Reveal>

      {live ? (
        <Reveal index={3} {...ENTER} rise={0}>
          <Section label="o que vem por aí" />
          {queue.length === 0 ? (
            <Txt variant="body" t="faint" style={styles.empty}>
              Quando houver algo a dizer, aparece aqui antes de chegar.
            </Txt>
          ) : (
            queue.slice(0, 8).map((q) => (
              <Animated.View key={q.id} entering={rowIn} exiting={rowOut} layout={listLayout} style={styles.queued}>
                <Txt variant="micro" f="sansMedium" t="muted">
                  {when(q.date)}
                </Txt>
                <Txt variant="body" style={styles.queuedTitle}>
                  {q.title}
                </Txt>
                <Txt variant="micro" t="faint" numberOfLines={2}>
                  {q.body}
                </Txt>
              </Animated.View>
            ))
          )}
          {queue.length > 8 ? (
            <Txt variant="micro" t="faint" style={styles.more}>
              {`e mais ${queue.length - 8} depois disso.`}
            </Txt>
          ) : null}

          <Press
            onPress={() =>
              void testFire().then((ok) =>
                snack(ok ? 'Pode fechar o app: o teste chega em 5 segundos.' : 'Não foi possível agendar o teste.', ok ? 'info' : 'error'),
              )
            }
            disabled={busy}
            style={styles.textAction}
            accessibilityLabel="Enviar um aviso de teste"
          >
            <Txt variant="body" t="muted">
              Enviar um aviso de teste
            </Txt>
          </Press>
          <Press
            onPress={() => void apply({ ...settings, enabled: false }).then(() => snack('Avisos pausados neste aparelho.', 'info'))}
            disabled={busy}
            style={styles.textAction}
            accessibilityLabel="Pausar todos os avisos"
          >
            {/* Pausing is reversible and loses nothing, so it is not drawn as a destructive act. */}
            <Txt variant="body" t="muted">
              Pausar todos os avisos
            </Txt>
          </Press>
        </Reveal>
      ) : null}
    </ScrollView>
  );
}

/** "hoje, 18:00", "amanhã, 9:00", "segunda, 9 de nov, 9:00" — how a person says when. */
function when(date: Date | null): string {
  if (!date) return '';
  const hour = format(date, 'H:mm');
  if (isToday(date)) return `hoje, ${hour}`;
  if (isTomorrow(date)) return `amanhã, ${hour}`;
  return `${format(date, "EEEE, d 'de' MMM", { locale: ptBR }).replace('-feira', '')}, ${hour}`;
}

function Section({ label }: { label: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.rule} />
      <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

function Status({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.status}>
      <Txt variant="body">{title}</Txt>
      <Txt variant="micro" t="faint" style={styles.statusBody}>
        {body}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.sm, paddingBottom: space.xxxl },
  heading: { paddingTop: space.lg },
  intro: { paddingTop: space.xs },
  section: { paddingTop: space.xxl },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  sectionLabel: { letterSpacing: 0.8, paddingTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  rowText: { flex: 1, paddingRight: space.lg },
  rowBody: { paddingTop: 2 },
  status: { paddingTop: space.xl },
  statusBody: { paddingTop: space.xs },
  primary: { marginTop: space.lg },
  empty: { paddingTop: space.md },
  queued: {
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  queuedTitle: { paddingTop: 2, paddingBottom: 2 },
  more: { paddingTop: space.md },
  textAction: { paddingTop: space.lg },
});
