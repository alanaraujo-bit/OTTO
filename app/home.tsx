import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { addMonths, format, startOfMonth, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Wordmark } from '@/ui/Wordmark';
import { Amount } from '@/ui/Amount';
import { MonthStepper } from '@/ui/MonthStepper';
import { MonthFlow } from '@/ui/MonthFlow';
import { Press } from '@/ui/Press';
import { Ask } from '@/ui/Icon';
import { useTabBarClearance } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { BalanceCurve } from '@/ui/chart/BalanceCurve';
import { CategoryDonut, type DonutSlice } from '@/ui/chart/CategoryDonut';
import { DebtLadder } from '@/ui/chart/DebtLadder';
import { Txt } from '@/theme/text';
import { color, HIT, space } from '@/theme/tokens';
import { spring, useReducedMotion } from '@/theme/motion';
import { useLedger } from '@/state/ledger';
import { forecastRoute, useNav } from '@/lib/nav';
import { lookFor, ringCut } from '@/domain/category';
import {
  dayItems,
  dayKey,
  debtStatus,
  monthCurve,
  parseDay,
  project,
  spendByCategory,
  incomeByCategory,
  type CategoryTotal,
  type DayItem,
  type MonthCurve,
} from '@/domain/projection';
import { settled } from '@/domain/settlement';
import { capReading } from '@/domain/cap';
import { withStatements } from '@/domain/card';
import { brl, brlDelta, brlShort, type Cents } from '@/domain/money';
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
  const clearance = useTabBarClearance();
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
    // What the lists project from — the rules plus each card's statement still to pay, the same set
    // the curve above reads, so the names under it add up to its figures.
    const forecast = withStatements(accounts, entries, series, today);
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
    const income = curve.era === 'future' ? [] : incomeByCategory(entries, spendFrom, spendTo);

    // The stretch just before this one, the same length, for the line under the ring's total: the
    // thirty days before a rolling window, the month before a closed one. It is only compared when
    // the ledger reaches all the way back to its first day — a stretch half-recorded would make any
    // month look like a fall.
    const prevTo = dayKey(subDays(parseDay(spendFrom), 1));
    const prevFrom = rolling ? dayKey(subDays(parseDay(spendFrom), 30)) : dayKey(startOfMonth(parseDay(prevTo)));
    const covered = curve.era !== 'future' && entries.some((e) => e.date <= prevFrom);
    const before = {
      out: covered ? spendByCategory(entries, prevFrom, prevTo, paymentSeries(series)) : null,
      in: covered ? incomeByCategory(entries, prevFrom, prevTo) : null,
    };

    /*
     * Four named categories and a remainder, not five.
     *
     * The cut is the palette's, and it is honest about it: five hues survived colour-vision
     * validation on this ground, and the remainder is not one of them — it is the leftover, drawn in
     * `inkFaint` because it has no identity to carry. Four named arcs plus a neutral is also simply
     * a better ring to read than six competing ones, so the constraint and the design agree.
     *
     * The cut itself is `ringCut`, which names the remainder "Demais" and keys it apart from any
     * category — see the note there.
     */
    const same = (a: string, b: string) =>
      a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

    /*
     * A ceiling is a monthly figure, so it is read on the calendar month to date — `capReading`, the
     * same reading the alerts make — and never on the ring's own window. Measured on a rolling thirty
     * days, "86% do teto" on the 19th counted late September against October's ceiling, and on the
     * 2nd last month's spending could cut the notch.
     */
    const capOf = (name: string) => {
      const cap = caps.find((c) => same(c.category, name));
      if (!cap) return { capCents: null };
      if (curve.era !== 'current') return { capCents: cap.capCents };
      const r = capReading(cap, entries, series, today);
      return { capCents: cap.capCents, capSpentCents: r.spent, burstsOn: r.burstsOn };
    };

    /*
     * "Outros" is a category the owner gave a name to and no meaning: it is where things go when they
     * have no better place. Drawn in a hue it was the loudest mark on the ring — 56% of a month in
     * teal, saying nothing. So it is set apart from the named slots and drawn grey, after the
     * categories that do say something and before the remainder.
     *
     * A named category under 2% of the ring joins the remainder rather than taking a slot: an arc
     * that thin is shorter than the gap that ends it, and cannot be seen or touched.
     */
    const slicesOf = (list: CategoryTotal[], flow: Flow): DonutSlice[] => {
      const total = sum(list);
      const prior = before[flow];
      const beforeOf = (name: string) =>
        prior ? (prior.find((c) => same(c.category, name))?.cents ?? 0) : null;
      const other = list.find((c) => same(c.category, 'Outros'));
      const named = list.filter((c) => c !== other);
      const keep = Math.min(4, named.filter((c) => c.cents / total >= 0.02).length);
      const cut = ringCut(named, keep);
      const ordered = [
        ...cut.filter((c) => !c.isRest),
        ...(other ? [{ key: other.category, category: other.category, cents: other.cents, isRest: false }] : []),
        ...cut.filter((c) => c.isRest),
      ];
      return ordered.map((c) =>
        c.isRest
          ? {
              ...c,
              // The seed "Outros" glyph, never the owner's own "Outros" look: the remainder has no
              // identity to borrow, and its arc is drawn neutral regardless.
              ...lookFor('Outros', []),
              capCents: null,
            }
          : {
              ...c,
              ...lookFor(c.category, storedCategories),
              // A ceiling only bounds spending, so the inflow ring never carries one.
              ...(flow === 'out' ? capOf(c.category) : { capCents: null }),
              beforeCents: beforeOf(c.category),
              plain: other !== undefined && c.category === other.category,
            },
      );
    };
    const ringOf = (list: CategoryTotal[], flow: Flow): Ring => {
      const total = sum(list);
      const prior = before[flow];
      return {
        slices: slicesOf(list, flow),
        total,
        note: prior ? compareNote(total, sum(prior), rolling) : undefined,
      };
    };

    // The named slice. In the current month that is today; in a month still ahead it is what the
    // month has committed to, which is the same question asked of a different tense. A closed month
    // gets neither — its names are in the spend breakdown below, and repeating them would be the
    // list restating itself.
    const slice: { label: string; items: SliceItem[] } | null =
      curve.era === 'current'
        ? { label: 'hoje', items: dayItems(entries, forecast, today, today, deferrals) }
        : curve.era === 'future'
          ? {
              // Both directions, in date order. This used to keep only saídas and call them
              // "lançamentos" — a month ahead has no lançamentos yet, and the salary that pays for
              // the rent belongs on the same list as the rent.
              label: 'previsto no mês',
              items: project(forecast, curve.from, curve.to, settled(entries), deferrals)
                .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
                .map((o) => ({
                  title: o.title,
                  category: o.category,
                  amountCents: o.amountCents,
                  direction: o.direction,
                  settled: false,
                  overdue: false,
                  occurrence: { seriesId: o.seriesId, scheduled: o.date, accountId: o.accountId },
                  entryId: null,
                  // Where it lands, which a deferral may have moved off its identifying date.
                  on: o.on,
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
      rings: { out: ringOf(spend, 'out'), in: ringOf(income, 'in') },
      rolling,
      slice,
      net,
      // Two directions, two totals. One "dívidas" figure used to add what the owner owes to what is
      // owed to them — R$ 46.504 owed plus a R$ 1.500 sale being paid off read as R$ 48.004 of debt.
      // Split the way Recorrências splits them, under the same names.
      debts: debtStatus(series).filter((d) => d.series.direction === 'out'),
      receivables: debtStatus(series).filter((d) => d.series.direction === 'in'),
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
        contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0} {...ENTER.head}>
          <View style={styles.top}>
            <Wordmark height={22} animate alive />
            <View style={styles.topSide}>
              <Txt variant="micro" t="faint">
                {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
              </Txt>
              {/*
                Otto lives at the top of the screen that asks "where do I stand", because that is
                the question it answers in words. A glyph rather than a label, so the readout row
                keeps its weight; the touch target is full size and is pulled back into the row's
                22dp so nothing below it moves.
              */}
              <Press
                onPress={() => router.push('/otto')}
                outerStyle={styles.ask}
                style={styles.askHit}
                accessibilityLabel="Perguntar ao Otto"
              >
                <Ask size={20} tint={color.inkMuted} />
              </Press>
            </View>
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
                {/*
                  The figure is a sum of movements, so touching it opens them — the razão, landed on
                  the day this figure is read at. Same reasoning as the two totals below it.
                */}
                <Press
                  onPress={() =>
                    go('ledger', {
                      at:
                        view.curve.era === 'current'
                          ? today
                          : view.curve.era === 'past'
                            ? view.curve.to
                            : view.curve.from,
                    })
                  }
                  scale={0.99}
                  outerStyle={styles.hero}
                  accessibilityLabel={`${heroLabel(view.curve.era)}, ${brl(view.curve.balanceNow)}. Abrir no razão.`}
                >
                  <Amount
                    cents={view.curve.balanceNow}
                    size="hero"
                    tone={view.curve.balanceNow < 0 ? 'negative' : 'ink'}
                  />
                  <View style={styles.heroRow}>
                    <Txt variant="label" t="muted">
                      {heroLabel(view.curve.era)}
                    </Txt>
                    {/* A coloured figure with no words beside it was a number asking to be decoded.
                        It says which stretch it measured. */}
                    {view.net !== 0 ? (
                      <Txt variant="label" t="faint" numberOfLines={1}>
                        <Txt
                          variant="label"
                          f="monoMedium"
                          t={view.net < 0 ? 'negative' : 'positive'}
                          tabular
                        >
                          {brlDelta(view.net)}
                        </Txt>
                        {view.curve.era === 'current'
                          ? ' no mês até hoje'
                          : view.curve.era === 'past'
                            ? ' no mês'
                            : ' previsto no mês'}
                      </Txt>
                    ) : null}
                  </View>
                </Press>
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
                      {troughSentence(view.curve)}
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
                      : view.slice.items.length > SLICE_MAX
                        ? `${SLICE_MAX} de ${view.slice.items.length}`
                        : `${view.slice.items.length} ${view.slice.items.length === 1 ? 'item' : 'itens'}`
                  }
                />
                <DayRows items={view.slice.items.slice(0, SLICE_MAX)} />
              </View>
            ) : null}

            {view.rings.out.slices.length > 0 || view.rings.in.slices.length > 0 ? (
              <FlowRings rings={view.rings} rolling={view.rolling} month={anchor} />
            ) : null}

            {view.debts.length > 0 ? (
              <View>
                <Section
                  label="você deve"
                  figure
                  aside={brlShort(view.debts.reduce((n, d) => n + d.remainingCents, 0))}
                />
                {view.debts.map((d, i) => (
                  <Press
                    key={d.series.id}
                    onPress={() => openDebt(d.series.id, d.series.linkedShareToken)}
                    accessibilityLabel={`Abrir ${d.series.title}`}
                  >
                    <DebtLadder debt={d} index={i} delay={640} />
                  </Press>
                ))}
              </View>
            ) : null}

            {view.receivables.length > 0 ? (
              <View>
                <Section
                  label="você recebe"
                  figure
                  aside={brlShort(view.receivables.reduce((n, d) => n + d.remainingCents, 0))}
                />
                {view.receivables.map((d, i) => (
                  <Press
                    key={d.series.id}
                    onPress={() => openDebt(d.series.id, d.series.linkedShareToken)}
                    accessibilityLabel={`Abrir ${d.series.title}`}
                  >
                    <DebtLadder debt={d} index={i} delay={700} />
                  </Press>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Signing out was parked here with a note saying it would move to settings when settings
            existed. It exists, so it moved — the home screen is about money, and the far end of its
            scroll is not a drawer. */}
      </ScrollView>
    </>
  );
}

/** A row of the named slice. A forecast in a month ahead also carries the day it lands on. */
type SliceItem = DayItem & { on?: string };

/** How many named rows the slice shows before the count takes over. The rest are one tap away. */
const SLICE_MAX = 8;

function heroLabel(era: MonthCurve['era']): string {
  return era === 'current' ? 'saldo hoje' : era === 'past' ? 'saldo no fechamento' : 'saldo ao abrir o mês';
}

/**
 * The warning, in one plain clause.
 *
 * "O mês fica negativo em −R$ 547" said negative twice and named the month as the thing going under,
 * when it is the balance. And when the low point *is* the first day, "no dia 1" hid the real news —
 * the month does not dip, it starts there.
 */
function troughSentence(curve: MonthCurve): string {
  const figure = brlShort(curve.trough.balance);
  if (curve.trough.day === 1 && curve.era !== 'current') {
    const name = format(parseDay(curve.from), 'MMMM', { locale: ptBR });
    const Name = name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1);
    return `${Name} ${curve.era === 'past' ? 'abriu' : 'já abre'} negativo, em ${figure}.`;
  }
  return `No dia ${curve.trough.day} o saldo ${curve.era === 'past' ? 'chegou' : 'chega'} a ${figure}.`;
}

/** A shared debt opens its live page; any other opens the rule — the same doors Recorrências uses. */
function openDebt(id: string, token: string | null) {
  if (token) router.push({ pathname: '/divida/[token]' as never, params: { token } });
  else router.push({ pathname: '/recorrencia', params: { id } });
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
function Section({ label, aside, figure }: { label: string; aside?: string; figure?: boolean }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRule} />
      <View style={styles.sectionRow}>
        <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>
          {label.toUpperCase()}
        </Txt>
        {/* Mono only when the aside is a figure; a count written in words is a phrase. */}
        {aside ? (
          <Txt variant="micro" f={figure ? 'mono' : 'sans'} t="faint" tabular>
            {aside}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

type Flow = 'out' | 'in';
type Ring = { slices: DonutSlice[]; total: Cents; note?: string };

const sum = (list: CategoryTotal[]) => list.reduce((n, c) => n + c.cents, 0);

/**
 * The line under the ring's total: how this stretch compares with the one before it.
 *
 * Words, not an arrow and not a colour. Less spending is not money coming in and more income is not
 * money going out, so neither may borrow green or red — and "acima"/"abaixo" reads the same for
 * either direction without deciding for the owner which one is good news.
 */
function compareNote(now: Cents, before: Cents, rolling: boolean): string | undefined {
  if (before <= 0) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  const then = rolling ? 'dos 30 dias anteriores' : 'do mês anterior';
  if (pct === 0) return `igual ${rolling ? 'aos 30 dias anteriores' : 'ao mês anterior'}`;
  // Past double, a percentage stops reading as a size: "10530% acima" is a number, "105 vezes" is news.
  if (pct > 100) {
    const times = (now / before).toFixed(1).replace('.', ',').replace(/,0$/, '');
    return `${times} vezes o valor ${then}`;
  }
  return `${Math.abs(pct)}% ${pct > 0 ? 'acima' : 'abaixo'} ${then}`;
}

/**
 * Where the money went, and where it came from: one ring, two faces.
 *
 * Spending alone answered half the question — a month of R$ 5.000 out reads one way against
 * R$ 9.000 in and another against R$ 4.000. So the ring turns over: a horizontal drag across it
 * moves between saídas and entradas, and the two names in the heading do the same on a touch. The
 * drag is never the only way across — DESIGN.md gives the lateral edges to the system Back gesture
 * and asks every swipe for a twin.
 *
 * The rule under the active name is the switch made visible. It follows the finger on the UI
 * thread, so the gesture teaches itself: pulling the ring slides the rule towards the other name
 * before anything has been decided. On release the new face is not slid in — the ring rules itself
 * again from twelve, the one motion this chart has, so a turn is a redraw and not a second kind of
 * animation stacked on the first.
 *
 * The face chosen survives a change of month, because the owner who turned to entradas is asking
 * about entradas in every month they step through. The legend holds the height of the longer face,
 * so turning never pulls the page up under the thumb.
 */
function FlowRings({
  rings,
  rolling,
  month,
}: {
  rings: Record<Flow, Ring>;
  rolling: boolean;
  /** Any day of the month being read. A new month redraws the ring rather than jumping its arcs. */
  month: string;
}) {
  const reduced = useReducedMotion();
  const initial: Flow = rings.out.slices.length === 0 && rings.in.slices.length > 0 ? 'in' : 'out';
  const [flow, setFlow] = useState<Flow>(initial);
  // The first face arrives with the screen's entrance; a face turned to, or a month stepped to,
  // arrives at once.
  const arrived = useRef(false);
  useEffect(() => {
    arrived.current = true;
  }, []);
  /** Finger travel across the ring, in px, while a drag is live. */
  const pull = useSharedValue(0);
  /** Which face the rule rests under: 0 saídas, 1 entradas. */
  const at = useSharedValue(initial === 'in' ? 1 : 0);
  /** x and width of each name, measured, so the rule can travel between them. */
  const names = useSharedValue<[number, number, number, number]>([0, 0, 0, 0]);
  const measured = useRef<[number, number, number, number]>([0, 0, 0, 0]);

  const choose = (next: Flow) => {
    if (next === flow) return;
    void Haptics.selectionAsync();
    const to = next === 'in' ? 1 : 0;
    at.value = reduced ? to : withSpring(to, spring.crisp);
    setFlow(next);
  };

  const pan = Gesture.Pan()
    // Strict on purpose: the drag spans the legend too, and a one-thumb scroll that drifts sideways
    // must stay a scroll.
    .activeOffsetX([-32, 32])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      pull.value = e.translationX;
    })
    .onEnd((e) => {
      const next =
        e.translationX < -56 || e.velocityX < -600
          ? 'in'
          : e.translationX > 56 || e.velocityX > 600
            ? 'out'
            : null;
      pull.value = reduced ? 0 : withSpring(0, spring.crisp);
      if (next) scheduleOnRN(choose, next);
    });

  // The ring gives a sixth of the finger's travel: enough to feel it, not enough to read as the
  // content being thrown away.
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pull.value * 0.16 }] }));
  const ruleStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, at.value - pull.value / 160));
    const n = names.value;
    return { left: n[0] + (n[2] - n[0]) * p, width: n[1] + (n[3] - n[1]) * p };
  });

  const ring = rings[flow];

  return (
    <View>
      <View style={styles.section}>
        <View style={styles.sectionRule} />
        <View style={styles.sectionRow}>
          <View style={styles.flowNames} accessibilityRole="tablist">
            {(['out', 'in'] as const).map((f, i) => (
              <View
                key={f}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  // Kept on the JS side and written whole: a shared value read back on this thread
                  // right after a write still holds the old tuple, and the second name would erase
                  // the first.
                  measured.current[i * 2] = x;
                  measured.current[i * 2 + 1] = width;
                  const m = measured.current;
                  names.value = [m[0], m[1], m[2], m[3]];
                }}
              >
                <Press
                  onPress={() => choose(f)}
                  haptic="none"
                  hitSlop={8}
                  outerStyle={styles.flowHit}
                  accessibilityRole="tab"
                  accessibilityLabel={f === 'out' ? 'Ver saídas' : 'Ver entradas'}
                  accessibilityState={{ selected: flow === f }}
                >
                  <Txt
                    variant="micro"
                    f="sansMedium"
                    t={flow === f ? 'ink' : 'faint'}
                    style={styles.sectionLabel}
                  >
                    {f === 'out' ? 'SAÍDAS' : 'ENTRADAS'}
                  </Txt>
                </Press>
              </View>
            ))}
            <Animated.View style={[styles.flowRule, ruleStyle]} pointerEvents="none" />
          </View>
        </View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.ringBlock, ringStyle]}>
          <CategoryDonut
            key={`${flow}:${month}`}
            slices={ring.slices}
            total={ring.total}
            direction={flow}
            label={rolling ? 'nos últimos 30 dias' : 'no mês'}
            note={ring.note}
            period={rolling ? 'nos últimos 30 dias' : 'no mês'}
            rows={Math.max(rings.out.slices.length, rings.in.slices.length)}
            delay={arrived.current ? 0 : 520}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** The day, named. Amounts hold their own column because they are tabular and right-aligned. */
function DayRows({ items }: { items: SliceItem[] }) {
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
function DayRow({ item: it }: { item: SliceItem }) {
  const to = it.occurrence
    ? forecastRoute(it.occurrence.seriesId, it.occurrence.scheduled)
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
          {/* In a month ahead the list spans thirty days, so each row says which one. */}
          {it.on ? ` · dia ${Number(it.on.slice(8))}` : ''}
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
        cents={it.amountCents}
        direction={it.direction}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.md, paddingBottom: space.xxl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topSide: { flexDirection: 'row', alignItems: 'center' },
  ask: { marginVertical: -(HIT - 22) / 2, marginLeft: space.sm, marginRight: -space.md },
  askHit: { width: HIT, alignItems: 'center' },
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
  flowNames: { flexDirection: 'row', gap: space.xl, paddingBottom: 6 },
  // The full 48dp target, pulled back to the 15dp line it sits on so the rule can sit under the word.
  flowHit: { marginVertical: -(HIT - 15) / 2 },
  flowRule: { position: 'absolute', bottom: 0, height: 1, backgroundColor: color.ink },
  ringBlock: { paddingTop: space.md },

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
