import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { addMonths, format, getDaysInMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Amount } from '@/ui/Amount';
import { Button } from '@/ui/Button';
import { Press } from '@/ui/Press';
import { Wordmark } from '@/ui/Wordmark';
import { PaymentHistory } from '@/ui/PaymentHistory';
import { Txt } from '@/theme/text';
import { color, space, type } from '@/theme/tokens';
import { acceptDebtShare, apkUrl, historyOf, readPublicDebt, type PublicDebtShare } from '@/lib/debtShare';
import { useSession } from '@/lib/auth/session';
import { useLedger } from '@/state/ledger';
import { useSnackbar } from '@/ui/Snackbar';
import { dayKey, parseDay } from '@/domain/projection';
import { brl, parts } from '@/domain/money';
import { firstInstallment } from '@/domain/settlement';
import { ApiError } from '@/lib/api';

/**
 * How often an open page re-reads the share. "Ao vivo" means a payment the owner records shows up
 * while the page is being looked at — within a quarter of a minute is that; every five seconds was
 * twelve requests a minute per open link for a figure that changes a few times a month.
 */
const REFRESH_MS = 15_000;
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
  /**
   * Whether a payload is on screen, read by the poll without being one of its dependencies. With
   * `debt` itself in `refresh`'s deps, every answer recreated `refresh`, which re-ran the polling
   * effect, which fetched again at once — a request loop limited only by the network's latency.
   */
  const shown = useRef(false);
  useEffect(() => {
    shown.current = debt !== null;
  }, [debt]);

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
        if (!quiet || !shown.current) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este acompanhamento.');
        }
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [token]);

  /*
   * The poll runs only while someone can see it: focused (cleanup runs on blur) and in the
   * foreground. Arriving or coming back to either reads at once, so the page is never stale on
   * return — loudly the first time, quietly once there is something on screen to keep.
   */
  useFocusEffect(
    useCallback(() => {
      void refresh(shown.current);
      let timer: ReturnType<typeof setInterval> | null = null;
      const start = () => {
        if (timer) return;
        timer = setInterval(() => void refresh(true), REFRESH_MS);
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
      };
      if (AppState.currentState === 'active') start();
      const foreground = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void refresh(true);
          start();
        } else {
          stop();
        }
      });
      return () => {
        stop();
        foreground.remove();
      };
    }, [refresh]),
  );

  const finishes = useMemo(() => {
    if (!debt) return '';
    return format(
      // Counted from the first installment, not the start's month: a debt created after its due day
      // pays nothing that month, and the app numbers it the same way.
      addMonths(parseDay(firstInstallment(debt)), debt.totalCount - 1),
      "MMMM 'de' yyyy",
      { locale: ptBR },
    );
  }, [debt]);

  /*
   * The next installment as a date, not a day number. "próximo dia 10" made the reader work out
   * which month, and said nothing when that day had already passed unpaid (DIV-04). Counted the
   * way the app numbers installments — from the first one, `paidCount` months on — and clamped to
   * the month's length the way the projection clamps a 31.
   */
  const next = useMemo(() => {
    if (!debt || debt.paidCount >= debt.totalCount) return null;
    const month = addMonths(parseDay(firstInstallment(debt)), debt.paidCount);
    const day = Math.min(debt.dayOfMonth, getDaysInMonth(month));
    const key = dayKey(new Date(month.getFullYear(), month.getMonth(), day));
    return { key, late: key < dayKey(new Date()) };
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
      // Named from the reader's side: what the owner owes them arrives as money to receive (DIV-08).
      snack(
        debt?.direction === 'out'
          ? 'Valor a receber adicionado às suas recorrências.'
          : 'Dívida adicionada às suas recorrências.',
        'info',
      );
      router.replace('/recorrencias');
    } catch (reason) {
      snack(reason instanceof Error ? reason.message : 'Não foi possível adicionar ao seu OTTO.', 'error');
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
          {/*
            Connection status in ink, not in traffic-light colours (DIV-02): a green dot on a page
            about a debt reads as "paid", and amber as "late". Live is a filled dot; reconnecting is
            an empty ring and fainter words.
          */}
          {debt ? (
            <View style={styles.live}>
              <View style={[styles.liveDot, connection === 'offline' ? styles.offlineDot : null]} />
              <Txt variant="micro" f="sansMedium" t={connection === 'offline' ? 'faint' : 'muted'}>
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
              {/*
                A finished debt says so (DIV-03). "R$ 0,00 ainda em aberto" is arithmetically true
                and emotionally wrong — the one moment this page exists to celebrate, read as an
                empty balance.
              */}
              {debt.paidCount >= debt.totalCount ? (
                <>
                  <Txt variant="display" f="sansSemibold">Quitada</Txt>
                  <Txt variant="label" t="muted" style={styles.remaining}>
                    {`todas as ${debt.totalCount} parcelas pagas`}
                  </Txt>
                </>
              ) : (
                <>
                  <HeroFigure cents={(debt.totalCount - debt.paidCount) * debt.amountCents} />
                  <Txt variant="label" t="muted" style={styles.remaining}>
                    ainda em aberto
                  </Txt>
                </>
              )}
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
                {next ? (
                  <Fact
                    label={next.late ? 'parcela vencida' : 'próxima parcela'}
                    value={format(parseDay(next.key), "d 'de' MMMM", { locale: ptBR })}
                    tone={next.late ? 'warning' : 'muted'}
                  />
                ) : null}
                <Fact label={next ? 'termina' : 'terminou'} value={finishes} last />
              </View>
            </View>

            <PaymentHistory {...history} total={debt.totalCount} />

            <View style={styles.actions}>
              {debt.paidCount >= debt.totalCount ? null : Platform.OS !== 'web' ? (
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

/**
 * The open balance at display size, as one line of text.
 *
 * `Amount` is three Text nodes in a row: TalkBack read it as "R$", "29.160", ",00", and at 1.5×
 * system font a five-figure debt pushed past the panel edge, since a row of Texts cannot shrink
 * (DIV-05, DIV-06). One Text with nested spans keeps the same typography — symbol and centavos
 * smaller and faint on the figure's baseline — reads as one phrase, and may scale itself down to
 * fit on one line.
 */
function HeroFigure({ cents }: { cents: number }) {
  const p = parts(cents);
  return (
    <Txt
      variant="display"
      f="monoSemibold"
      tabular
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.5}
      accessibilityLabel={brl(cents)}
    >
      {/* The spans keep the display line height: a smaller one on a nested span makes Android
          size the whole line to it and clip the figure. */}
      <Txt variant="body" f="mono" t="faint" style={styles.heroMinor}>{`${p.sign}${p.symbol} `}</Txt>
      {p.whole}
      <Txt variant="body" f="mono" t="faint" tabular style={styles.heroMinor}>{`,${p.cents}`}</Txt>
    </Txt>
  );
}

/** One fact. Dates written as words are sans; figures arrive as `Amount` nodes. */
function Fact({
  label,
  value,
  last = false,
  tone = 'muted',
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
  tone?: 'muted' | 'warning';
}) {
  return (
    <View style={[styles.fact, last ? styles.factLast : null]}>
      <Txt variant="micro" t="faint">{label}</Txt>
      {typeof value === 'string' ? (
        <Txt variant="body" t={tone} numberOfLines={1} style={styles.factValue}>{value}</Txt>
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
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.ink },
  offlineDot: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.inkFaint },
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
  factValue: { flexShrink: 1, paddingLeft: space.lg, textAlign: 'right' },
  heroMinor: { lineHeight: type.display.leading },
  actions: { paddingTop: space.xxl },
  secondaryAction: { paddingTop: space.md },
  privateCopy: { paddingTop: space.md },
  close: { marginTop: space.md },
});
