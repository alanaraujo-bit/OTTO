import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Amount } from '@/ui/Amount';
import { Button } from '@/ui/Button';
import { Press } from '@/ui/Press';
import { Wordmark } from '@/ui/Wordmark';
import { PaymentHistory } from '@/ui/PaymentHistory';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { acceptDebtShare, apkUrl, historyOf, readPublicDebt, type PublicDebtShare } from '@/lib/debtShare';
import { useSession } from '@/lib/auth/session';
import { useLedger } from '@/state/ledger';
import { useSnackbar } from '@/ui/Snackbar';
import { parseDay } from '@/domain/projection';
import { ApiError } from '@/lib/api';

const REFRESH_MS = 5_000;
const PREVIEW: PublicDebtShare = {
  ownerName: 'Alan',
  recipientName: 'Gabriel',
  acceptedAt: null,
  title: 'Notebook',
  category: 'Dívidas',
  amountCents: 29160,
  direction: 'out',
  dayOfMonth: 10,
  startDate: '2026-04-01',
  totalCount: 10,
  paidCount: 3,
  // Two recorded and one from before the debt was tracked, so the preview exercises the
  // reconciliation and all three lag readings rather than only the happy row.
  payments: [
    { scheduled: '2026-05-10', paidOn: '2026-05-08', recordedAt: '2026-05-08T21:14:00.000Z', amountCents: 29160 },
    { scheduled: '2026-06-10', paidOn: '2026-06-13', recordedAt: null, amountCents: 29160 },
  ],
};

/** One public truth, shared by the web fallback and the native deep-link destination. */
export default function SharedDebt() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const session = useSession((state) => state.session);
  const loadLedger = useLedger((state) => state.load);
  const snack = useSnackbar();
  const [debt, setDebt] = useState<PublicDebtShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'loading' | 'live' | 'offline' | 'revoked'>('loading');
  const [accepting, setAccepting] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!token) return;
    if (__DEV__ && token === 'preview') {
      setDebt(PREVIEW);
      setError(null);
      setConnection('live');
      setLoading(false);
      return;
    }
    try {
      const next = await readPublicDebt(token);
      setDebt(next);
      setError(null);
      setConnection('live');
    } catch (reason) {
      if (reason instanceof ApiError && (reason.status === 404 || reason.status === 410)) {
        setDebt(null);
        setError('Este link não está mais ativo.');
        setConnection('revoked');
      } else {
        setConnection('offline');
        if (!quiet || !debt) {
          setError(reason instanceof Error ? reason.message : 'Não consegui abrir este acompanhamento.');
        }
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [debt, token]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(true), REFRESH_MS);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh(true);
    });
    return () => {
      clearInterval(timer);
      foreground.remove();
    };
  }, [refresh]);

  const finishes = useMemo(() => {
    if (!debt) return '';
    return format(
      addMonths(startOfMonth(parseDay(debt.startDate)), debt.totalCount - 1),
      "MMMM 'de' yyyy",
      { locale: ptBR },
    );
  }, [debt]);

  // Recomputed only when the payload changes, not on every poll tick that returns the same rows.
  const history = useMemo(
    () => (debt ? historyOf(debt) : { payments: [], untracked: 0 }),
    [debt],
  );

  const accept = async () => {
    if (!session) {
      router.push({ pathname: '/sign-in', params: { next: `/divida/${token}` } });
      return;
    }
    setAccepting(true);
    try {
      await acceptDebtShare(token);
      await loadLedger();
      snack('Dívida adicionada às suas recorrências.', 'info');
      router.replace('/recorrencias');
    } catch (reason) {
      snack(reason instanceof Error ? reason.message : 'Não consegui adicionar esta dívida.', 'error');
      setAccepting(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, Platform.OS === 'web' ? styles.web : null]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Wordmark />
          {debt ? (
            <View style={styles.live}>
              <View style={[styles.liveDot, connection === 'offline' ? styles.offlineDot : null]} />
              <Txt variant="micro" f="sansMedium" t={connection === 'offline' ? 'warning' : 'muted'}>
                {connection === 'offline' ? 'RECONECTANDO' : 'AO VIVO'}
              </Txt>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.state}>
            <Txt variant="heading" t="muted">Abrindo o acompanhamento…</Txt>
          </View>
        ) : !debt ? (
          <View style={styles.state}>
            <Txt variant="title" f="sansSemibold">
              {connection === 'revoked' ? 'Este link não está mais ativo.' : 'Sem conexão com o acompanhamento.'}
            </Txt>
            <Txt variant="body" t="muted" style={styles.stateCopy}>
              {connection === 'revoked'
                ? 'Peça um novo link para a pessoa que compartilhou a dívida.'
                : error ?? 'Confira sua internet e tente novamente.'}
            </Txt>
            {connection === 'offline' ? (
              <View style={styles.retry}><Button label="Tentar novamente" variant="outline" onPress={() => void refresh()} /></View>
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Txt variant="body" t="muted">
                {debt.direction === 'out'
                  ? `${debt.ownerName} deve a ${debt.recipientName}`
                  : `${debt.recipientName} deve a ${debt.ownerName}`}
              </Txt>
              <Txt variant="title" f="sansSemibold" style={styles.title}>{debt.title}</Txt>
              <Amount
                cents={(debt.totalCount - debt.paidCount) * debt.amountCents}
                size="hero"
                tone="ink"
              />
              <Txt variant="label" t="muted" style={styles.remaining}>
                ainda em aberto
              </Txt>
            </View>

            <View style={styles.progress}>
              <View style={styles.rule} />
              <View style={styles.progressHead}>
                <Txt variant="micro" f="sansMedium" t="muted">PARCELAS</Txt>
                <Txt variant="label" f="monoMedium" tabular>
                  {debt.paidCount}/{debt.totalCount}
                </Txt>
              </View>
              {debt.totalCount <= 24 ? (
                <View style={styles.ticks}>
                  {Array.from({ length: debt.totalCount }, (_, index) => (
                    <View key={index} style={[styles.tick, index < debt.paidCount ? styles.tickPaid : null]} />
                  ))}
                </View>
              ) : (
                <View style={styles.progressRail}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, (debt.paidCount / debt.totalCount) * 100)}%` },
                    ]}
                  />
                </View>
              )}
              <View style={styles.facts}>
                <Fact label="cada parcela" value={<Amount cents={debt.amountCents} size="body" tone="muted" />} />
                <Fact label="próximo dia" value={`${debt.dayOfMonth}`} />
                <Fact label="termina" value={finishes} last />
              </View>
            </View>

            <PaymentHistory {...history} total={debt.totalCount} />

            <View style={styles.actions}>
              {Platform.OS !== 'web' ? (
                <Button
                  label={debt.direction === 'out' ? 'Adicionar como valor a receber' : 'Adicionar como dívida minha'}
                  onPress={() => void accept()}
                  loading={accepting}
                />
              ) : (
                <>
                  <Button
                    label="Abrir no OTTO"
                    onPress={() => void Linking.openURL(`otto://divida/${token}`)}
                  />
                  {apkUrl() ? (
                    <View style={styles.secondaryAction}>
                      <Button
                        label="Baixar o APK"
                        variant="outline"
                        onPress={() => void Linking.openURL(apkUrl() as string)}
                      />
                    </View>
                  ) : null}
                </>
              )}
              <Txt variant="label" t="muted" center style={styles.privateCopy}>
                Link privado e revogável. Nenhuma conta bancária ou outro lançamento é compartilhado.
              </Txt>
            </View>
          </>
        )}

        {Platform.OS !== 'web' ? (
          <Press onPress={() => router.replace('/')} style={styles.close} accessibilityLabel="Fechar">
            <Txt variant="label" t="faint" center>Agora não</Txt>
          </Press>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Fact({ label, value, last = false }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <View style={[styles.fact, last ? styles.factLast : null]}>
      <Txt variant="micro" t="faint">{label}</Txt>
      {typeof value === 'string' ? (
        <Txt variant="body" f="monoMedium" t="muted" tabular>{value}</Txt>
      ) : value}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.xl, paddingBottom: space.xxxl },
  web: { width: '100%', maxWidth: 620, alignSelf: 'center', minHeight: '100%' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.positive },
  offlineDot: { backgroundColor: color.warning },
  state: { paddingTop: 120 },
  stateCopy: { paddingTop: space.md },
  retry: { paddingTop: space.xl },
  hero: { paddingTop: 72 },
  title: { paddingTop: space.sm, paddingBottom: space.xxl },
  remaining: { paddingTop: space.xs },
  progress: { paddingTop: space.xxxl },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong },
  progressHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: space.lg,
  },
  ticks: { flexDirection: 'row', gap: 3, paddingTop: space.lg },
  tick: { flex: 1, height: 8, borderRadius: 1, backgroundColor: color.hairline },
  tickPaid: { backgroundColor: color.positive },
  progressRail: { height: 8, marginTop: space.lg, borderRadius: 1, backgroundColor: color.hairline, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: color.positive },
  facts: { paddingTop: space.xl },
  fact: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  factLast: { borderBottomWidth: 0 },
  actions: { paddingTop: space.xxl },
  secondaryAction: { paddingTop: space.md },
  privateCopy: { paddingTop: space.md },
  close: { marginTop: space.md },
});
