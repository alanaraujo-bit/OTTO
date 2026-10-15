import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Wordmark } from '@/ui/Wordmark';
import { Amount } from '@/ui/Amount';
import { MonthSwipe } from '@/ui/MonthSwipe';
import { MonthFlow } from '@/ui/MonthFlow';
import { Press } from '@/ui/Press';
import { TabBar } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { BalanceCurve } from '@/ui/chart/BalanceCurve';
import { type DonutSlice } from '@/ui/chart/CategoryDonut';
import { FlowPager } from '@/ui/chart/FlowPager';
import { DebtLadder } from '@/ui/chart/DebtLadder';
import { PaceBars } from '@/ui/chart/PaceBars';
import { RuleBars } from '@/ui/chart/RuleBars';
import { CapRule } from '@/ui/chart/CapRule';
import { BalanceTrail } from '@/ui/chart/BalanceTrail';
import { SeenReveal } from '@/ui/SeenReveal';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useLedger } from '@/state/ledger';
import { useNav } from '@/lib/nav';
import { lookFor } from '@/domain/category';
import {
  dayItems,
  dayKey,
  debtStatus,
  incomeByCategory,
  monthCurve,
  parseDay,
  project,
  spendByCategory,
  type CategoryTotal,
  type DayItem,
} from '@/domain/projection';
import { settled } from '@/domain/settlement';
import { brlDelta, brlShort, type Cents } from '@/domain/money';
import { paymentSeries } from '@/domain/spend';
import { capReadings } from '@/domain/cap';
import { categoryPace, MIN_BASIS, spendPace } from '@/domain/analysis';
import { largestSpends, weekdayRhythm } from '@/domain/rhythm';
import type { Entry } from '@/domain/model';

/**
 * Where do I stand.
 *
 * The screen is built around one claim: a balance on its own cannot answer that question. R$ 4.800
 * is comfortable on the 28th and precarious on the 2nd with rent unpaid, and no amount of styling
 * makes a lone figure say which. So the number and the month it sits inside are one reading — the
 * figure, then the line it belongs to, elapsed solid and forecast dashed on one axis.
 *
 * The month is navigable because "where do I stand" is a question with a tense. The same instrument
 * reads a month that has closed and a month that has not started; what changes is what it is allowed
 * to claim, which is why the curve loses its seam and its marker for today outside the current month
 * rather than pretending every month has a middle.
 *
 * Above the fold: the month, the figure, the shape, and the two forces pulling on it. That is the
 * glance PRODUCT.md asks for. Everything below the fold — where the money went, what is still owed —
 * is the follow-up question, and it is placed where a follow-up belongs.
 */
export default function Home() {
  return (
    <Screen bottomInset={false}>
      <HomeBody />
    </Screen>
  );
}

function HomeBody() {
  // One arrival for all four tabs, carrying the direction of the move that produced it.
  const ENTER = useTabEntrance();
  const go = useNav((s) => s.go);

  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const load = useLedger((s) => s.load);
  const accounts = useLedger((s) => s.accounts);
  const series = useLedger((s) => s.series);
  const entries = useLedger((s) => s.entries);
  const caps = useLedger((s) => s.caps);
  const storedCategories = useLedger((s) => s.categories);
  const deferrals = useLedger((s) => s.deferralsBySlot);

  const [plotWidth, setPlotWidth] = useState(0);

  // The scroll position and the viewport height, on the UI thread. Each section below the fold reads
  // them to know when the owner has scrolled to it (see SeenReveal), so nothing re-renders on scroll.
  const scrollY = useSharedValue(0);
  const viewH = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const onViewport = (e: LayoutChangeEvent) => {
    viewH.value = e.nativeEvent.layout.height;
  };

  useEffect(() => {
    void load();
  }, [load]);

  // Today is read once per mount, not per render: a date recomputed inside a render makes every
  // derived value a new object and the charts re-animate for no reason.
  const today = useMemo(() => dayKey(new Date()), []);

  /** Which month the instrument is pointed at. Any day inside it identifies it. */
  const [anchor, setAnchor] = useState(today);

  // How far the owner may travel, taken from the evidence rather than from a guess. Backwards stops
  // at the first month the ledger has anything recorded in; forwards stops where projecting further
  // stops being honest.
  const bounds = useMemo(() => {
    const first = entries.reduce<string | null>(
      (min, e) => (min === null || e.date < min ? e.date : min),
      null,
    );
    const t = parseDay(today);
    return {
      min: dayKey(startOfMonth(first ? parseDay(first) : t)),
      max: dayKey(startOfMonth(addMonths(t, 6))),
    };
  }, [entries, today]);

  const view = useMemo(() => {
    if (!ready || error) return null;

    const curve = monthCurve(accounts, entries, series, today, deferrals, anchor);
    const t = parseDay(today);

    // Spend is read over a rolling window in the current month and over the month itself in a closed
    // one. Month-to-date says nothing on the second of the month, which is exactly when someone
    // opens the app wondering where the money went; a closed month has no such problem and reading
    // it as anything but itself would be wrong.
    const rolling = curve.era === 'current';
    const spendFrom = rolling
      ? dayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 29))
      : curve.from;
    const spendTo = rolling ? today : curve.to;
    // Paying a statement is not spending: the purchases it settles were counted the day they were
    // made. Counting both would report a grocery run twice.
    const spend =
      curve.era === 'future'
        ? []
        : spendByCategory(entries, spendFrom, spendTo, paymentSeries(series));

    const capOf = (name: string) =>
      caps.find((c) => c.category.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
        ?.capCents ?? null;

    // Income has no ceilings, so its ring carries no notches — only the composition of what came in.
    const categories = ringSlices(spend, storedCategories, capOf);
    const inflow = curve.era === 'future' ? [] : incomeByCategory(entries, spendFrom, spendTo);
    const incomeSlices = ringSlices(inflow, storedCategories);

    // The named slice. In the current month that is today; in a month still ahead it is what the
    // month has committed to, which is the same question asked of a different tense. A closed month
    // gets neither — its names are in the spend breakdown below, and repeating them would be the
    // list restating itself.
    const slice: { label: string; items: DayItem[] } | null =
      curve.era === 'current'
        ? { label: 'hoje', items: dayItems(entries, series, today, today, deferrals) }
        : curve.era === 'future'
          ? {
              label: 'compromissos do mês',
              items: project(series, curve.from, curve.to, settled(entries), deferrals)
                .filter((o) => o.direction === 'out')
                .slice(0, 6)
                .map((o) => ({
                  title: o.title,
                  category: o.category,
                  amountCents: o.amountCents,
                  direction: o.direction,
                  settled: false,
                  overdue: false,
                  occurrence: { seriesId: o.seriesId, scheduled: o.date, accountId: o.accountId },
                  entryId: null,
                })),
            }
          : null;

    // What the month moved, net. For a month still ahead there is no elapsed half to measure, so the
    // figure is the whole month's projected swing instead.
    const net =
      curve.era === 'future'
        ? curve.balanceEnd - curve.balanceStart
        : curve.balanceNow - curve.balanceStart;

    return {
      curve,
      categories,
      spendTotal: spend.reduce((n, c) => n + c.cents, 0),
      incomeSlices,
      incomeTotal: inflow.reduce((n, c) => n + c.cents, 0),
      spendLabel: rolling ? 'últimos 30 dias' : 'gastos do mês',
      slice,
      net,
      debts: debtStatus(series),
    };
  }, [ready, error, accounts, entries, series, caps, storedCategories, deferrals, today, anchor]);

  /**
   * The readings below the fold. Each one reads the month being looked at, except the ones that only
   * have an answer for the present — "is this normal" and "how far through the ceilings" compare today
   * against the owner's own history, so they are read over today and shown only when today's month is
   * the one on screen. Showing them under another month's name would be a figure the ledger can
   * contradict.
   */
  const below = useMemo(() => {
    if (!view) return null;
    const { curve } = view;
    const payments = paymentSeries(series);
    const current = curve.era === 'current';
    const inMonth = curve.era !== 'future';
    const from = curve.from;
    const to = current ? today : curve.to;

    const rhythm = inMonth ? weekdayRhythm(entries, payments, from, to) : [];
    const largest = inMonth ? largestSpends(entries, payments, from, to, 5) : [];
    const monthOut = inMonth
      ? spendByCategory(entries, from, to, payments).reduce((n, c) => n + c.cents, 0)
      : 0;

    const pace = current ? spendPace(entries, series, today, 6) : null;
    const paceRows = current
      ? categoryPace(entries, series, today, 6)
          .slice(0, 5)
          .map((c) => ({ label: c.category, cents: c.cents, usual: c.usual }))
      : [];
    const readings = current ? capReadings(caps, entries, series, today) : [];

    // Six month-ends, the one on screen last. Each is the same curve the hero reads, so the trail and
    // the figure at the top cannot disagree about where a month closes.
    const anchorDate = parseDay(from);
    const trail = [5, 4, 3, 2, 1, 0].map((back) => {
      const m = dayKey(addMonths(anchorDate, -back));
      const c = monthCurve(accounts, entries, series, today, deferrals, m);
      return {
        key: m,
        label: format(parseDay(m), 'MMM yy', { locale: ptBR }),
        cents: c.balanceEnd,
        era: c.era,
        from: m,
      };
    });

    return { current, inMonth, from, to, rhythm, largest, monthOut, pace, paceRows, readings, trail };
  }, [view, series, entries, caps, accounts, deferrals, today]);

  const onPlot = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setPlotWidth((prev) => (prev === w ? prev : w));
  };

  return (
    <>
      <Animated.ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={onViewport}
      >
        <Reveal index={0} {...ENTER.head}>
          <View style={styles.top}>
            <Wordmark height={22} animate alive />
            <Txt variant="micro" t="faint">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </Txt>
          </View>
        </Reveal>

        {/*
          The month's figures, and the stepper that names them. Dragging across this block changes the
          month; the stepper stays put and the figures below it travel with the finger (see MonthSwipe).
        */}
        <Reveal index={1} {...ENTER.body} rise={0} style={styles.stepper}>
          <MonthSwipe
            anchor={anchor}
            today={today}
            era={view?.curve.era ?? 'current'}
            min={bounds.min}
            max={bounds.max}
            onChange={setAnchor}
          >
            {/*
              Before the ledger is read, the instrument shows a blank readout rather than a skeleton: the
              hero slot keeps its exact shape and the number lands in place, so nothing jumps. The cold
              start has to run the sample once, and that pause is the owner's first impression of this
              screen.
            */}
            {!ready && !error ? (
              <Reveal index={2} {...ENTER.body}>
                <View style={styles.hero}>
                  <Txt variant="display" f="monoSemibold" t="faint" tabular>
                    —
                  </Txt>
                  <Txt variant="label" t="faint">
                    lendo seu razão
                  </Txt>
                </View>
              </Reveal>
            ) : null}

            {error ? (
              <Reveal index={2} {...ENTER.body}>
                <Txt variant="heading" f="sansSemibold" style={styles.head}>
                  Não consegui ler seus dados.
                </Txt>
                <Txt variant="body" t="muted" style={styles.sub}>
                  {error}
                </Txt>
              </Reveal>
            ) : null}

            {view ? (
              <>
                <Reveal index={2} {...ENTER.body}>
                  <View style={styles.hero}>
                    <Amount
                      cents={view.curve.balanceNow}
                      size="hero"
                      tone={view.curve.balanceNow < 0 ? 'negative' : 'ink'}
                    />
                    <View style={styles.heroRow}>
                      <Txt variant="label" t="muted">
                        {view.curve.era === 'current'
                          ? 'saldo hoje'
                          : view.curve.era === 'past'
                            ? 'saldo no fechamento'
                            : 'saldo ao abrir o mês'}
                      </Txt>
                      {view.net !== 0 ? (
                        <Txt
                          variant="label"
                          f="monoMedium"
                          t={view.net < 0 ? 'negative' : 'positive'}
                          tabular
                        >
                          {brlDelta(view.net)}
                        </Txt>
                      ) : null}
                    </View>
                  </View>
                </Reveal>

                <Reveal index={3} {...ENTER.body} rise={0} style={styles.plot}>
                  <View onLayout={onPlot}>
                    {plotWidth > 0 ? (
                      <BalanceCurve curve={view.curve} width={plotWidth} />
                    ) : null}
                  </View>
                </Reveal>

                <Reveal index={4} {...ENTER.body} style={styles.flowBlock}>
                  <MonthFlow
                    outflow={view.curve.outflow}
                    outflowDone={view.curve.outflowDone}
                    inflow={view.curve.inflow}
                    inflowDone={view.curve.inflowDone}
                    closed={view.curve.era === 'past'}
                    delay={420}
                    /*
                      A total is the sum of a set of movements, so touching it opens that set: the
                      ledger, cut to this direction and landed on the month the stepper is pointed at
                      rather than on today.

                      It is the same tab change the bar performs, carrying where to land, which is
                      why it goes through `go` and not `push` — arriving at the razão from here has
                      to leave the owner *on* the razão, with its marker lit, not on a page above it.
                    */
                    onOpen={(d) => go('ledger', { at: view.curve.from, focus: d })}
                  />
                </Reveal>

                {/*
                  The one sentence the arithmetic exists to produce. It is only rendered when it is
                  true, so it never becomes furniture the owner learns to skip — the month either dips
                  below zero or this line is not there at all.

                  It sits *after* the two flows rather than between them and the curve, because it is
                  conditional and they are not: putting a variable-height block above fixed content
                  would push that content off the first screen exactly in the months where the owner
                  most needs to see all of it at once.
                */}
                {view.curve.trough.balance < 0 ? (
                  <Reveal index={5} {...ENTER.body}>
                    <View style={styles.alert}>
                      <View style={styles.alertRule} />
                      <Txt variant="body" t="negative">
                        No dia {view.curve.trough.day} o mês{' '}
                        {view.curve.era === 'past' ? 'ficou' : 'fica'} negativo em{' '}
                        {brlShort(view.curve.trough.balance)}.
                      </Txt>
                    </View>
                  </Reveal>
                ) : null}
              </>
            ) : null}
          </MonthSwipe>
        </Reveal>

        {view ? (
          <>

            {/*
              Below the fold there is no entrance. Content the owner has to scroll to is introduced by the
              act of scrolling to it — the sections further down wrap themselves in SeenReveal for exactly
              that — and animating it on arrival as well is the scattered effect that makes a screen feel
              busy rather than alive.
            */}
            {view.slice ? (
              <View>
                <Section
                  label={view.slice.label}
                  aside={
                    view.slice.items.length === 0
                      ? undefined
                      : `${view.slice.items.length} ${view.slice.items.length === 1 ? 'lançamento' : 'lançamentos'}`
                  }
                />
                <DayRows items={view.slice.items} />
              </View>
            ) : null}

            {view.categories.length > 0 || view.incomeSlices.length > 0 ? (
              <View>
                <Section label={view.spendLabel} />
                <FlowPager
                  centerLabel={view.spendLabel}
                  delay={520}
                  pages={[
                    {
                      key: 'out',
                      label: 'Saídas',
                      slices: view.categories,
                      total: view.spendTotal,
                      empty: 'Nenhum gasto registrado.',
                      onSelect: () => router.push('/categorias'),
                    },
                    {
                      key: 'in',
                      label: 'Entradas',
                      slices: view.incomeSlices,
                      total: view.incomeTotal,
                      empty: 'Nenhuma entrada registrada.',
                    },
                  ]}
                />
              </View>
            ) : null}

            {view.debts.length > 0 ? (
              <View>
                <Section
                  label="dívidas"
                  aside={brlShort(view.debts.reduce((n, d) => n + d.remainingCents, 0))}
                />
                {view.debts.map((d, i) => (
                  <DebtLadder key={d.series.id} debt={d} index={i} delay={640} />
                ))}
              </View>
            ) : null}

            {below ? (
              <>
                {/*
                  The sections below are each introduced by the scroll that reaches them (SeenReveal),
                  rather than by the entrance, which has already been spent on the fold above.
                */}
                <SeenReveal scrollY={scrollY} viewH={viewH}>
                  <Section
                    label="contra o normal"
                    aside={
                      below.pace && below.pace.delta !== null ? brlDelta(below.pace.delta) : undefined
                    }
                  />
                  {!below.current ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Compara o mês atual com os anteriores, então só existe para hoje.
                    </Txt>
                  ) : below.pace && below.pace.usual === null ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Ainda não há {MIN_BASIS} meses completos no razão para dizer o que é normal. Hoje
                      há {below.pace.basis}.
                    </Txt>
                  ) : below.paceRows.length === 0 ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Nenhum gasto neste mês até hoje.
                    </Txt>
                  ) : (
                    <View style={styles.block}>
                      <PaceBars data={below.paceRows} />
                      <Link
                        label="ver saídas do mês"
                        onPress={() => go('ledger', { at: below.from, focus: 'out' })}
                      />
                    </View>
                  )}
                </SeenReveal>

                <SeenReveal scrollY={scrollY} viewH={viewH}>
                  <Section
                    label="ritmo por dia da semana"
                    aside={
                      below.inMonth && below.rhythm.some((r) => r.cents > 0) ? 'média por dia' : undefined
                    }
                  />
                  {!below.inMonth ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Este mês ainda não começou.
                    </Txt>
                  ) : below.rhythm.every((r) => r.cents === 0) ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Nenhum gasto neste mês ainda.
                    </Txt>
                  ) : (
                    <View style={styles.block}>
                      <RuleBars data={below.rhythm.map((r) => ({ label: r.label, cents: r.cents }))} />
                      <Link
                        label="ver os lançamentos do mês"
                        onPress={() => go('ledger', { at: below.from, focus: 'out' })}
                      />
                    </View>
                  )}
                </SeenReveal>

                <SeenReveal scrollY={scrollY} viewH={viewH}>
                  <Section
                    label="maiores saídas"
                    aside={below.monthOut > 0 ? brlShort(below.monthOut) : undefined}
                  />
                  {!below.inMonth ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Este mês ainda não começou.
                    </Txt>
                  ) : below.largest.length === 0 ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Nenhuma saída registrada neste mês.
                    </Txt>
                  ) : (
                    <View style={styles.block}>
                      <DayRows items={below.largest.map(entryItem)} />
                      <Link
                        label="ver todas as saídas"
                        onPress={() => go('ledger', { at: below.from, focus: 'out' })}
                      />
                    </View>
                  )}
                </SeenReveal>

                <SeenReveal scrollY={scrollY} viewH={viewH}>
                  <Section label="tetos" />
                  {!below.current ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Os tetos são lidos sobre o mês atual.
                    </Txt>
                  ) : below.readings.length === 0 ? (
                    <View style={styles.block}>
                      <Txt variant="body" t="faint">
                        Nenhum teto definido. Um teto avisa quando a categoria está perto do limite.
                      </Txt>
                      <Link label="definir tetos" onPress={() => router.push('/tetos')} />
                    </View>
                  ) : (
                    <View style={styles.block}>
                      {below.readings.map((r) => (
                        <CapRule key={r.category} reading={r} onPress={() => router.push('/tetos')} />
                      ))}
                      <Link label="ver tetos" onPress={() => router.push('/tetos')} />
                    </View>
                  )}
                </SeenReveal>

                <SeenReveal scrollY={scrollY} viewH={viewH}>
                  <Section label="saldo, últimos seis meses" />
                  {entries.length === 0 ? (
                    <Txt variant="body" t="faint" style={styles.emptyDay}>
                      Sem lançamentos para mostrar o saldo de meses passados.
                    </Txt>
                  ) : (
                    <View style={styles.block}>
                      <BalanceTrail
                        months={below.trail}
                        onOpen={(at) => go('ledger', { at })}
                      />
                    </View>
                  )}
                </SeenReveal>
              </>
            ) : null}
          </>
        ) : null}

        {/* Signing out was parked here with a note saying it would move to settings when settings
            existed. It exists, so it moved — the home screen is about money, and the far end of its
            scroll is not a drawer. */}
      </Animated.ScrollView>

      <TabBar
        active="home"
        onCapture={() => router.push('/lancar')}
      />
    </>
  );
}

/**
 * A group boundary, the way this world draws one: a rule, then the label under it.
 *
 * No card, no heading weight, no eyebrow. The rule says "a new group starts here" and the label says
 * what it is — which is the entire grammar the ledger needs.
 *
 * The label is set in muted rather than faint. Faint was doing five different jobs on this screen —
 * section names, captions, units, axis ticks, item categories — and a tone that means everything
 * ranks nothing. Faint now means "supporting detail" only, and these headings sit a step above it.
 */
function Section({ label, aside }: { label: string; aside?: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRule} />
      <View style={styles.sectionRow}>
        <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>
          {label.toUpperCase()}
        </Txt>
        {aside ? (
          <Txt variant="micro" f="mono" t="faint" tabular>
            {aside}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The way from a reading to what it sums. Every figure in the sections below has one, and it is set
 * as a plain line under the rows rather than as a control competing with them.
 */
function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} haptic="none" outerStyle={styles.link} accessibilityLabel={label}>
      <Txt variant="micro" f="sansMedium" t="muted">
        {label}
      </Txt>
    </Press>
  );
}

/** A recorded purchase, in the shape the day rows draw. It is settled, so it reads as what happened. */
function entryItem(e: Entry): DayItem {
  return {
    title: e.title,
    category: e.category,
    amountCents: e.amountCents,
    direction: 'out',
    settled: true,
    overdue: false,
    occurrence: null,
    entryId: e.id,
  };
}

/** The day, named. Amounts hold their own column because they are tabular and right-aligned. */
function DayRows({ items }: { items: DayItem[] }) {
  if (items.length === 0) {
    return (
      <Txt variant="body" t="faint" style={styles.emptyDay}>
        Nada lançado até agora.
      </Txt>
    );
  }

  return (
    <View style={styles.dayList}>
      {items.map((it, i) => (
        <DayRow key={`${it.title}-${i}`} item={it} />
      ))}
    </View>
  );
}

/**
 * One named movement, and the way to act on it.
 *
 * A row that names a bill and will not open it is the screen describing something it refuses to
 * hand over. Where it leads depends on what it is, and the two cases are exclusive by
 * construction: a forecast goes to the rule that produced it, which is where "já recebi" lives; a
 * lançamento already recorded goes to itself, in the screen that edits one.
 *
 * A forecast with no `occurrence` — there is no such row today — would have nowhere to go, so it
 * stays a readout rather than a control that does nothing.
 */
function DayRow({ item: it }: { item: DayItem }) {
  const to = it.occurrence
    ? ({ pathname: '/recorrencia', params: { id: it.occurrence.seriesId } } as const)
    : it.entryId
      ? ({ pathname: '/lancar', params: { id: it.entryId } } as const)
      : null;

  const body = (
    <View style={styles.dayRow}>
      <View style={styles.dayName}>
        <Txt variant="body" t="ink" numberOfLines={1}>
          {it.title}
        </Txt>
        <Txt variant="micro" t={it.overdue ? 'warning' : 'faint'} numberOfLines={1}>
          {it.category}
          {/* Late is not the same news as expected. And an inflow that never arrived is not
              overdue in the owner's sense — nobody owes it to themselves. */}
          {it.settled
            ? ''
            : it.overdue
              ? it.direction === 'in'
                ? ' · não recebido'
                : ' · vencido'
              : ' · previsto'}
        </Txt>
      </View>
      <Amount
        cents={it.direction === 'out' ? -it.amountCents : it.amountCents}
        size="body"
        tone={it.direction === 'out' ? 'negative' : 'positive'}
      />
    </View>
  );

  if (!to) return body;

  return (
    <Press onPress={() => router.push(to)} accessibilityLabel={`Abrir ${it.title}`}>
      {body}
    </Press>
  );
}

/**
 * The ring's slices for one flow: the four largest named categories, and a remainder.
 *
 * Four named categories and a remainder, not five. The cut is the palette's, and it is honest about
 * it: five hues survived colour-vision validation on this ground, and "Outros" is not one of them — it
 * is the leftover, drawn in `inkFaint` because it has no identity to carry. Four named arcs plus a
 * neutral is also simply a better ring to read than six competing ones, so the constraint and the
 * design agree.
 *
 * Only spending has ceilings, so only spending passes `capOf`.
 */
function ringSlices(
  totals: CategoryTotal[],
  stored: Parameters<typeof lookFor>[1],
  capOf?: (name: string) => Cents | null,
): DonutSlice[] {
  const top = totals.slice(0, 4);
  const rest = totals.slice(4).reduce((n, c) => n + c.cents, 0);
  return [
    ...top.map((c) => ({
      category: c.category,
      ...lookFor(c.category, stored),
      cents: c.cents,
      capCents: capOf?.(c.category) ?? null,
    })),
    ...(rest > 0
      ? [
          {
            category: 'Outros',
            ...lookFor('Outros', stored),
            cents: rest,
            capCents: null,
            isRest: true,
          } satisfies DonutSlice,
        ]
      : []),
  ];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.md, paddingBottom: space.xxl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { paddingTop: space.xl },
  sub: { paddingTop: space.sm },

  stepper: { paddingTop: space.lg },

  hero: { paddingTop: space.xl },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: space.xs,
  },

  plot: { paddingTop: space.lg },

  alert: { paddingTop: space.lg },
  alertRule: {
    height: 1,
    backgroundColor: color.negative,
    opacity: 0.5,
    marginBottom: space.md,
  },

  flowBlock: { paddingTop: space.xl },

  section: { paddingTop: space.xl },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
  },
  sectionLabel: { letterSpacing: 0.8 },

  block: { paddingTop: space.sm },
  link: { alignSelf: 'flex-start', paddingTop: space.md },

  dayList: { paddingTop: space.xs },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  dayName: { flex: 1, paddingRight: space.lg },
  emptyDay: { paddingTop: space.md },

});
