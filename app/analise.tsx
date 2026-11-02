import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { duration, ease, rowOut } from '@/theme/motion';
import { RuleTabs } from '@/ui/RuleTabs';
import { ChevronRight } from '@/ui/Icon';
import { Wordmark } from '@/ui/Wordmark';
import { Amount } from '@/ui/Amount';
import { Press } from '@/ui/Press';
import { useTabBarClearance } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { PaceBars, type PaceDatum } from '@/ui/chart/PaceBars';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useLedger } from '@/state/ledger';
import { capReadings } from '@/domain/cap';
import { dayKey, parseDay } from '@/domain/projection';
import { categoryPace, spendPace, MIN_BASIS } from '@/domain/analysis';
import { brlShort } from '@/domain/money';
import { lookFor } from '@/domain/category';

/**
 * "Isso é normal?"
 *
 * The home screen answers *where do I stand*; the ledger answers *what*. This screen exists for the
 * one question neither can touch, and it is a question no single figure can answer — R$ 1.200 on
 * groceries is meaningless until it sits next to the R$ 900 the owner usually spends. So nothing
 * here is a bare total. Every figure is a comparison, and the thing compared against is the owner.
 *
 * **The authored idea: the same day of the month.** Reading a month that is two days old against
 * months that are thirty days old would announce a triumphant saving on the 2nd of every month,
 * forever — exactly the class of quietly wrong number this project was written against. So the
 * solid part of every rule covers the same stretch of each month, and the faint tail is the rest of
 * those months, which really happened and must not be hidden. The tick across each rule is the
 * owner's own median: past it is more than usual, short of it is less. One mark, one idea, carried
 * through both charts on the screen.
 *
 * **And it refuses to answer when it cannot.** Below two comparable months there is no normal, so
 * the screen says that instead of drawing a median from a sample of one. A month the ledger only
 * half saw is not a frugal month, and it is left out of the basis on the same principle.
 */
export default function Analise() {
  return (
    <Screen bottomInset={false}>
      <AnaliseBody />
    </Screen>
  );
}

function AnaliseBody() {
  const clearance = useTabBarClearance();
  // One arrival for all four tabs, carrying the direction of the move that produced it.
  const ENTER = useTabEntrance();

  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const load = useLedger((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  const view = useReading();

  /*
   * Three questions, three places. Stacked on one scroll they read as one dense report that had to be
   * decoded top to bottom; split, each answers one thing and says how to read it in a sentence.
   */
  const [tab, setTab] = useState<Tab>('resumo');
  const moved = useRef(0);
  const choose = (next: Tab) => {
    moved.current = TABS.findIndex((t) => t.key === next) - TABS.findIndex((t) => t.key === tab);
    setTab(next);
  };
  const turn = (to: Tab) => {
    void Haptics.selectionAsync();
    choose(to);
  };
  // A drag across the reading turns to the neighbouring section, the way the Home's ring turns
  // between saídas and entradas. The names above stay the obvious route; this is the quick one.
  const at = TABS.findIndex((t) => t.key === tab);
  const next = TABS[at + 1]?.key;
  const prev = TABS[at - 1]?.key;
  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-20, 20])
    .onEnd((e) => {
      const to =
        e.translationX < -56 || e.velocityX < -600
          ? next
          : e.translationX > 56 || e.velocityX > 600
            ? prev
            : undefined;
      if (to) scheduleOnRN(turn, to);
    });
  // The first section arrives with the screen; one turned to arrives from the side it lies on.
  const entering = moved.current > 0 ? FROM_RIGHT : moved.current < 0 ? FROM_LEFT : undefined;
  const chartDelay = moved.current === 0 ? 420 : 120;

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
            <Txt variant="micro" t="faint">
              você, comparado com você
            </Txt>
          </View>
        </Reveal>

        <Reveal index={1} {...ENTER.body} rise={0} style={styles.tabs}>
          <RuleTabs tabs={TABS} value={tab} onChange={choose} />
        </Reveal>

        {!ready && !error ? (
          <Reveal index={2} {...ENTER.body} exiting={rowOut}>
            <Txt variant="body" t="faint" style={styles.notice}>
              lendo seu razão
            </Txt>
          </Reveal>
        ) : null}

        {error ? (
          <Reveal index={2} {...ENTER.body}>
            <Txt variant="heading" f="sansSemibold" style={styles.head}>
              Não consegui ler seus dados.
            </Txt>
            <Txt variant="body" t="muted" style={styles.notice}>
              {error}
            </Txt>
          </Reveal>
        ) : null}

        {view ? (
          <GestureDetector gesture={swipe}>
            <Animated.View key={tab} entering={entering} style={styles.page}>
              {tab === 'resumo' ? (
                <Resumo view={view} ENTER={ENTER.body} chartDelay={chartDelay} />
              ) : tab === 'categorias' ? (
                <Categorias view={view} ENTER={ENTER.body} chartDelay={chartDelay} />
              ) : (
                <Tetos view={view} ENTER={ENTER.body} />
              )}
            </Animated.View>
          </GestureDetector>
        ) : null}
      </ScrollView>
    </>
  );
}

type Tab = 'resumo' | 'categorias' | 'tetos';
const TABS = [
  { key: 'resumo', label: 'resumo' },
  { key: 'categorias', label: 'categorias' },
  { key: 'tetos', label: 'tetos' },
] as const satisfies readonly { key: Tab; label: string }[];

const FROM_RIGHT = FadeInRight.duration(duration.rule).easing(ease.out);
const FROM_LEFT = FadeInLeft.duration(duration.rule).easing(ease.out);

type Reading = NonNullable<ReturnType<typeof useReading>>;
type Enter = ReturnType<typeof useTabEntrance>['body'];

/**
 * "Estou gastando mais que o normal?" — the figure, the answer in one sentence, and the months it
 * was measured against. Every word a first-time owner needs is on screen; nothing asks to be decoded.
 */
function Resumo({ view, ENTER, chartDelay }: { view: Reading; ENTER: Enter; chartDelay: number }) {
  const delta = view.pace.delta ?? 0;
  return (
    <>
      {/*
        The verdict. The figure is what has gone out this month so far; the line under it is the
        only thing that makes that figure mean anything.
      */}
      <Reveal index={2} {...ENTER}>
        <View style={styles.hero}>
          {/* A magnitude. The label already says it went out; a minus sign repeated it and made
              the figure read as a balance gone negative. */}
          <Amount cents={view.pace.spent} size="hero" tone="ink" />
          <Txt variant="label" t="muted" style={styles.heroLabel}>
            {view.period}
          </Txt>
        </View>
      </Reveal>

      <Reveal index={3} {...ENTER}>
        {view.enough ? (
          <View style={styles.verdict}>
            <View
              style={[styles.verdictRule, { backgroundColor: delta > 0 ? color.negative : color.positive }]}
            />
            <Txt variant="body" t="ink">
              {delta === 0
                ? `Exatamente o que você costuma gastar até o dia ${view.pace.day}.`
                : `${brlShort(Math.abs(delta))} ${delta > 0 ? 'a mais' : 'a menos'} do que você costuma gastar até o dia ${view.pace.day}.`}
            </Txt>
            {/* "Mediana" and "trecho" were the two words a first reading stopped on. The idea is
                the same, said the way the owner would say it. */}
            <Txt variant="micro" t="faint" style={styles.basis}>
              {`Seu normal até o dia ${view.pace.day} é ${brlShort(view.pace.usual ?? 0)}: o valor do meio dos seus últimos ${view.pace.basis} meses, contando só até esse mesmo dia em cada um.`}
            </Txt>
          </View>
        ) : (
          /*
            The empty state is not polish here — with a young ledger it is the screen's most likely
            first appearance. It says what is missing and when it arrives, rather than drawing a
            median from a sample of one and calling it a normal.
          */
          <View style={styles.verdict}>
            <View style={[styles.verdictRule, styles.verdictRuleQuiet]} />
            <Txt variant="body" t="muted">
              Ainda não tenho com o que comparar.
            </Txt>
            <Txt variant="micro" t="faint" style={styles.basis}>
              {view.pace.basis === 0
                ? `Preciso de ${MIN_BASIS} meses completos para saber qual é o seu normal.`
                : `Tenho ${view.pace.basis} mês completo. Com mais ${MIN_BASIS - view.pace.basis}, esta tela começa a responder.`}
            </Txt>
          </View>
        )}
      </Reveal>

      {view.months.length > 0 ? (
        <Reveal index={4} {...ENTER} rise={0}>
          <Section label="mês a mês" aside={`até o dia ${view.pace.day} de cada um`} />
          {/* The current month carries the mark, because it is the row being judged. */}
          <PaceBars
            data={view.months.map((m) => (m.past ? m : { ...m, usual: view.pace.usual }))}
            delay={chartDelay}
          />
          <Txt variant="micro" t="faint" style={styles.legend}>
            {`Para comparar igual com igual, a barra forte conta só até o dia ${view.pace.day} de cada mês. A parte clara é o resto daquele mês.`}
            {view.enough ? ' O traço marca o seu normal.' : ''}
            {view.dropped ? ' ' + view.dropped : ''}
          </Txt>
        </Reveal>
      ) : null}
    </>
  );
}

/** "Onde foi o dinheiro?" — this month's categories, each against what it usually takes. */
function Categorias({ view, ENTER, chartDelay }: { view: Reading; ENTER: Enter; chartDelay: number }) {
  return (
    <Reveal index={2} {...ENTER} rise={0}>
      <Txt variant="body" t="muted" style={styles.intro}>
        {'Quanto saiu em cada categoria este mês, até hoje.'}
        {view.enough
          ? ` O traço marca o que você costuma gastar nela até o dia ${view.pace.day}.`
          : ''}
      </Txt>
      {view.categories.length > 0 ? (
        <>
          <Section label="este mês" aside={view.enough ? 'traço = o seu normal' : undefined} />
          <PaceBars data={view.categories} delay={chartDelay} />
        </>
      ) : (
        <Txt variant="body" t="faint" style={styles.notice}>
          Nenhum gasto neste mês ainda.
        </Txt>
      )}
    </Reveal>
  );
}

/**
 * "Vou estourar?" — each ceiling read the only way that changes a decision: what is left, per day.
 * With none set, the section is one sentence that says what a teto is and one way in.
 */
function Tetos({ view, ENTER }: { view: Reading; ENTER: Enter }) {
  return (
    <Reveal index={2} {...ENTER} rise={0}>
      <Txt variant="body" t="muted" style={styles.intro}>
        Teto é o máximo que você aceita gastar numa categoria por mês. O OTTO acompanha o ritmo e avisa
        antes de passar.
      </Txt>
      {view.caps.length > 0 ? (
        <>
          {/* The aside names the column on the right, which is what it actually holds. */}
          <Section label="este mês" aside="gasto / teto" />
          {view.caps.map((c) => (
            <View key={c.category} style={styles.capRow}>
              <View style={styles.capName}>
                <Txt variant="body" numberOfLines={1}>
                  {c.category}
                </Txt>
                <Txt
                  variant="micro"
                  t={c.leftCents <= 0 || c.burstsOn ? 'negative' : 'faint'}
                  numberOfLines={2}
                >
                  {c.leftCents < 0
                    ? `passou do teto em ${brlShort(-c.leftCents)}`
                    : c.leftCents === 0
                      ? 'chegou ao teto'
                      : c.burstsOn
                        ? `no ritmo atual, passa do teto no dia ${Number(c.burstsOn.slice(8))}`
                        : `${brlShort(c.perDayCents)} por dia até o fim do mês`}
                </Txt>
              </View>
              <Txt variant="label" f="monoMedium" t="muted" tabular numberOfLines={1}>
                {`${brlShort(c.spent)} / ${brlShort(c.capCents)}`}
              </Txt>
            </View>
          ))}
        </>
      ) : null}
      <Press
        onPress={() => router.push('/tetos')}
        style={styles.action}
        accessibilityLabel={view.caps.length > 0 ? 'Ajustar tetos' : 'Definir um teto'}
      >
        <Txt variant="body" f="sansMedium">
          {view.caps.length > 0 ? 'Ajustar tetos' : 'Definir um teto'}
        </Txt>
        <ChevronRight tint={color.inkMuted} />
      </Press>
    </Reveal>
  );
}

/** What the screen reads off the ledger: this month's pace, the months behind it, and the tetos. */
function useReading() {
  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const entries = useLedger((s) => s.entries);
  const series = useLedger((s) => s.series);
  const caps = useLedger((s) => s.caps);
  const storedCategories = useLedger((s) => s.categories);

  const today = useMemo(() => dayKey(new Date()), []);

  return useMemo(() => {
    if (!ready || error) return null;

    const pace = spendPace(entries, series, today, 6);
    const cats = categoryPace(entries, series, today, 6);

    // Only months the ledger saw the whole of. Drawing the rest as R$ 0 rows would be the same lie
    // the basis rule exists to prevent, restated as a picture.
    const months: PaceDatum[] = pace.history
      .filter((m) => m.covered)
      .map((m) => ({
        label: format(parseDay(m.from), 'MMM', { locale: ptBR }).toUpperCase(),
        cents: m.toDate,
        tail: m.complete ? m.cents - m.toDate : 0,
        past: m.complete,
      }));

    /*
     * The month the ledger started in, when it started after the 1st, is left out of the chart on
     * purpose (see `covered`) — but leaving it out *silently* read as the app having lost September.
     * So the screen names the month it dropped and why, in one line under the chart.
     */
    const first = entries.reduce<string | null>(
      (min, e) => (min === null || e.date < min ? e.date : min),
      null,
    );
    const dropped =
      first && first.slice(8) !== '01'
        ? pace.history.find((m) => !m.covered && m.month === first.slice(0, 7))
        : undefined;

    const month = format(parseDay(today), 'MMMM', { locale: ptBR });

    return {
      pace,
      months,
      // The same window stated in words, so this figure cannot be mistaken for the Home's rolling
      // thirty days — the two can land on the same number and still be different claims.
      period:
        pace.day === 1 ? `gasto hoje, 1º de ${month}` : `gasto de 1 a ${pace.day} de ${month}`,
      dropped: dropped && first
        ? `${cap1(format(parseDay(dropped.from), 'MMMM', { locale: ptBR }))} fica de fora: seu razão começa em ${Number(first.slice(8))} de ${format(parseDay(first), 'MMMM', { locale: ptBR })}, e um mês visto pela metade não serve de comparação.`
        : null,
      // Each category wears the glyph and hue it wears in the Home's ring, so "Transporte" is
      // recognisably the same thing on both screens before its name is read.
      categories: cats.slice(0, 7).map((c) => ({
        label: c.category,
        cents: c.cents,
        usual: c.usual,
        ...lookFor(c.category, storedCategories),
      })),
      enough: pace.usual !== null,
      caps: capReadings(caps, entries, series, today),
    };
  }, [ready, error, entries, series, caps, storedCategories, today]);
}

const cap1 = (w: string) => w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1);

/** A group boundary, drawn the way this world draws one: a rule, then the label under it. */
function Section({ label, aside }: { label: string; aside?: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRule} />
      <View style={styles.sectionRow}>
        <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>
          {label.toUpperCase()}
        </Txt>
        {aside ? (
          <Txt variant="micro" t="faint">
            {aside}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingTop: space.xl },
  intro: { paddingTop: space.xl },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  capName: { flex: 1, paddingRight: space.md },
  flex: { flex: 1 },
  // The page grows to the bottom of the screen, so a short section can still be swiped anywhere.
  scroll: { flexGrow: 1, paddingTop: space.md, paddingBottom: space.xxl },
  page: { flex: 1 },

  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { paddingTop: space.xl },
  notice: { paddingTop: space.lg },

  hero: { paddingTop: space.xl },
  heroLabel: { paddingTop: space.xs },

  verdict: { paddingTop: space.lg },
  verdictRule: { height: 1, opacity: 0.5, marginBottom: space.md },
  verdictRuleQuiet: { backgroundColor: color.hairlineStrong, opacity: 1 },
  basis: { paddingTop: space.xs },

  section: { paddingTop: space.xxl },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
  },
  sectionLabel: { letterSpacing: 0.8 },
  legend: { paddingTop: space.lg },
});
