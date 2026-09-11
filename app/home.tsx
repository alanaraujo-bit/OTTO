import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Wordmark } from '@/ui/Wordmark';
import { Amount } from '@/ui/Amount';
import { MonthStepper } from '@/ui/MonthStepper';
import { MonthFlow } from '@/ui/MonthFlow';
import { TabBar } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { BalanceCurve } from '@/ui/chart/BalanceCurve';
import { CategoryDonut, type DonutSlice } from '@/ui/chart/CategoryDonut';
import { DebtLadder } from '@/ui/chart/DebtLadder';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useLedger } from '@/state/ledger';
import { lookFor } from '@/domain/category';
import {
  dayItems,
  dayKey,
  debtStatus,
  monthCurve,
  parseDay,
  project,
  spendByCategory,
  type DayItem,
} from '@/domain/projection';
import { settled } from '@/domain/settlement';
import { brlDelta, brlShort } from '@/domain/money';
import { paymentSeries } from '@/domain/spend';

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

    /*
     * Four named categories and a remainder, not five.
     *
     * The cut is the palette's, and it is honest about it: five hues survived colour-vision
     * validation on this ground, and "Outros" is not one of them — it is the leftover, drawn in
     * `inkFaint` because it has no identity to carry. Four named arcs plus a neutral is also simply
     * a better ring to read than six competing ones, so the constraint and the design agree.
     */
    const top = spend.slice(0, 4);
    const rest = spend.slice(4).reduce((n, c) => n + c.cents, 0);
    const capOf = (name: string) =>
      caps.find((c) => c.category.trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
        ?.capCents ?? null;

    const categories: DonutSlice[] = [
      ...top.map((c) => ({
        category: c.category,
        ...lookFor(c.category, storedCategories),
        cents: c.cents,
        capCents: capOf(c.category),
      })),
      ...(rest > 0
        ? [
            {
              category: 'Outros',
              ...lookFor('Outros', storedCategories),
              cents: rest,
              capCents: null,
              isRest: true,
            } satisfies DonutSlice,
          ]
        : []),
    ];

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
      spendLabel: rolling ? 'últimos 30 dias' : 'gastos do mês',
      slice,
      net,
      debts: debtStatus(series),
    };
  }, [ready, error, accounts, entries, series, caps, storedCategories, deferrals, today, anchor]);

  const onPlot = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setPlotWidth((prev) => (prev === w ? prev : w));
  };

  return (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0} {...ENTER.head}>
          <View style={styles.top}>
            <Wordmark height={22} animate alive />
            <Txt variant="micro" t="faint">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </Txt>
          </View>
        </Reveal>

        <Reveal index={1} {...ENTER.body} rise={0} style={styles.stepper}>
          <MonthStepper
            anchor={anchor}
            today={today}
            era={view?.curve.era ?? 'current'}
            min={bounds.min}
            max={bounds.max}
            onChange={setAnchor}
          />
        </Reveal>

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
            {/*
              Keyed on the month, so changing it dissolves the readout and re-rules it rather than
              swapping digits in place. This is the screen's one authored moment: the month is the
              only thing on it the owner can change, so it is the only thing that gets a transition.
            */}
            <Animated.View key={anchor} entering={FadeIn.duration(220)}>
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
            </Animated.View>

            {/*
              Below the fold the entrance stops. Content the owner has to scroll to has already been
              introduced by the act of scrolling to it, and animating it as well is the scattered
              effect that makes a screen feel busy rather than alive.
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

            {view.categories.length > 0 ? (
              <View>
                <Section label={view.spendLabel} />
                <CategoryDonut
                  slices={view.categories}
                  total={view.spendTotal}
                  label={view.spendLabel}
                  delay={520}
                  onSelect={() => router.push('/categorias')}
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
          </>
        ) : null}

        {/* Signing out was parked here with a note saying it would move to settings when settings
            existed. It exists, so it moved — the home screen is about money, and the far end of its
            scroll is not a drawer. */}
      </ScrollView>

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
        <View key={`${it.title}-${i}`} style={styles.dayRow}>
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
      ))}
    </View>
  );
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
