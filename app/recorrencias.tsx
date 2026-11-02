import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeInLeft,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Amount } from '@/ui/Amount';
import { FlowAmount } from '@/ui/FlowAmount';
import { Wordmark } from '@/ui/Wordmark';
import { RuleTabs } from '@/ui/RuleTabs';
import { ChevronRight } from '@/ui/Icon';
import { DebtLadder } from '@/ui/chart/DebtLadder';
import { onTabScroll, useTabBarClearance } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { duration, ease, listLayout, rowOut, useReducedMotion } from '@/theme/motion';
import { useLedger } from '@/state/ledger';
import { dayKey, parseDay } from '@/domain/projection';
import { commitments, type Commitment, type Commitments } from '@/domain/commitments';
import { brlShort } from '@/domain/money';

/**
 * Fixas: the rules, not the facts.
 *
 * Every other screen in OTTO is the ledger — things that happened, or things the engine says will.
 * This is the other side: the recurrences that *produce* them. It used to be a page inside Ajustes,
 * one long list where rent, salary and a seventeen-installment debt sat in the same column, reached
 * through a row labelled like a setting. It is a tab now, because it is half of how the app works.
 *
 * **The question it answers first: what does my month have left before I spend anything?** That
 * figure leads, said in one plain sentence, with a rule under it showing how much of what comes in
 * already has somewhere to go. Then the three kinds are three places — saídas, entradas, parcelas —
 * so each list is one kind of thing, and an empty one says what belongs there and offers to add it.
 *
 * **A rule costs something over its life, and nobody ever adds it up.** Spotify is not R$ 21,90; it
 * is R$ 262,80 a year. Every row still carries that second figure, computed by the same projection
 * the rest of the app runs. For a debt the number inverts: not what it costs to keep, but what is
 * left and when it stops.
 */
export default function Recorrencias() {
  return (
    <Screen bottomInset={false}>
      <RecorrenciasBody />
    </Screen>
  );
}

type Tab = 'saidas' | 'entradas' | 'parcelas';
const TABS = [
  { key: 'saidas', label: 'saídas' },
  { key: 'entradas', label: 'entradas' },
  { key: 'parcelas', label: 'parcelas' },
] as const satisfies readonly { key: Tab; label: string }[];

const FROM_RIGHT = FadeInRight.duration(duration.rule).easing(ease.out);
const FROM_LEFT = FadeInLeft.duration(duration.rule).easing(ease.out);

function RecorrenciasBody() {
  const clearance = useTabBarClearance();
  // One arrival for every tab, carrying the direction of the move that produced it.
  const ENTER = useTabEntrance();

  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const load = useLedger((s) => s.load);
  const series = useLedger((s) => s.series);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => dayKey(new Date()), []);
  const view = useMemo(
    () => (!ready || error ? null : commitments(series, today)),
    [ready, error, series, today],
  );

  const [tab, setTab] = useState<Tab>('saidas');
  const moved = useRef(0);
  const choose = (next: Tab) => {
    moved.current = TABS.findIndex((t) => t.key === next) - TABS.findIndex((t) => t.key === tab);
    setTab(next);
  };
  const turn = (to: Tab) => {
    void Haptics.selectionAsync();
    choose(to);
  };
  // A drag across the list turns to the neighbouring kind, as on Análise and the Home's ring. The
  // names above stay the obvious route; this is the quick one.
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
  const entering = moved.current > 0 ? FROM_RIGHT : moved.current < 0 ? FROM_LEFT : undefined;

  return (
    <ScrollView
      onScroll={onTabScroll}
      scrollEventThrottle={16}
      style={styles.flex}
      contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}
      showsVerticalScrollIndicator={false}
    >
      <Reveal index={0} {...ENTER.head}>
        <View style={styles.top}>
          <Wordmark height={22} animate alive />
          <Txt variant="micro" t="faint">
            o que se repete todo mês
          </Txt>
        </View>
      </Reveal>

      {error ? (
        <Reveal index={1} {...ENTER.body}>
          <Txt variant="heading" f="sansSemibold" style={styles.head}>
            Não foi possível ler seus dados.
          </Txt>
          <Txt variant="body" t="muted" style={styles.notice}>
            {error}
          </Txt>
        </Reveal>
      ) : null}

      {view ? (
        <>
          <Reveal index={1} {...ENTER.body}>
            <Free view={view} />
          </Reveal>

          <Reveal index={2} {...ENTER.body} rise={0} style={styles.add}>
            <Button label="Nova recorrência" onPress={() => router.push('/recorrencia')} />
          </Reveal>

          <Reveal index={3} {...ENTER.body} rise={0} style={styles.tabs}>
            <RuleTabs tabs={TABS} value={tab} onChange={choose} />
          </Reveal>

          <GestureDetector gesture={swipe}>
            <Animated.View key={tab} entering={entering} style={styles.page}>
              {tab === 'saidas' ? (
                <Kind
                  items={view.out}
                  total="sai por mês"
                  empty="Aluguel, internet, luz, academia, assinaturas: o que sai todo mês, sem data para acabar."
                  action="Cadastrar uma saída fixa"
                  shape="out"
                  today={today}
                />
              ) : tab === 'entradas' ? (
                <Kind
                  items={view.in}
                  total="entra por mês"
                  empty="Salário, pensão, um aluguel que você recebe: o dinheiro que chega todo mês."
                  action="Cadastrar uma entrada fixa"
                  shape="in"
                  today={today}
                />
              ) : (
                <Parcelas view={view} today={today} />
              )}
            </Animated.View>
          </GestureDetector>
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * The figure the screen is for, and how much of what comes in is already spoken for.
 *
 * "Livre por mês, antes de você gastar" was right and needed a second reading. The sentence under it
 * now says the arithmetic in words, and the rule draws it: the whole width is what comes in, the ink
 * part is what the saídas and parcelas already take. A month that promises more than it earns fills
 * the rule and turns it red, which says "negative" before the minus sign is read.
 */
function Free({ view }: { view: Commitments }) {
  const reduced = useReducedMotion();
  const share = view.monthlyIn > 0 ? Math.min(1, view.monthlyOut / view.monthlyIn) : view.monthlyOut > 0 ? 1 : 0;
  const over = view.free < 0;
  const grown = useSharedValue(reduced ? share : 0);
  useEffect(() => {
    grown.value = reduced
      ? share
      : withDelay(260, withTiming(share, { duration: duration.focal, easing: ease.out }));
  }, [share, reduced, grown]);
  const fill = useAnimatedStyle(() => ({ width: `${grown.value * 100}%` }));

  return (
    <View style={styles.hero}>
      <Amount cents={view.free} size="hero" tone={over ? 'negative' : 'ink'} />
      <Txt variant="label" t="muted" style={styles.heroLabel}>
        {over ? 'faltam por mês, antes de você gastar' : 'sobram por mês, antes de você gastar'}
      </Txt>

      {view.monthlyIn > 0 || view.monthlyOut > 0 ? (
        <>
          <View style={styles.track} accessible={false}>
            <Animated.View
              style={[styles.used, { backgroundColor: over ? color.negative : color.ink }, fill]}
            />
          </View>
          <Txt variant="micro" t="faint" style={styles.heroNote}>
            {'Entram '}
            <Txt variant="micro" f="mono" t="muted" tabular>
              {brlShort(view.monthlyIn)}
            </Txt>
            {' por mês, e '}
            <Txt variant="micro" f="mono" t="muted" tabular>
              {brlShort(view.monthlyOut)}
            </Txt>
            {' já têm destino em saídas e parcelas.'}
          </Txt>
        </>
      ) : null}
    </View>
  );
}

/** One kind of rule: its monthly total, its rows, and — empty — what belongs here and a way in. */
function Kind({
  items,
  total,
  empty,
  action,
  shape,
  today,
}: {
  items: Commitment[];
  total: string;
  empty: string;
  action: string;
  shape: 'out' | 'in';
  today: string;
}) {
  if (items.length === 0) return <Empty text={empty} action={action} shape={shape} />;
  const monthly = items.reduce((n, c) => n + c.monthlyCents, 0);
  return (
    <>
      <Section label={total} aside={brlShort(monthly)} />
      {items.map((c) => (
        <Animated.View key={c.series.id} layout={listLayout} exiting={rowOut}>
          <Row c={c} today={today} />
        </Animated.View>
      ))}
    </>
  );
}

/**
 * A rule, read as a sentence: what it is, when it lands, what it costs over the year.
 *
 * The yearly figure is the second line, muted — it is the reading that changes a mind, never louder
 * than the name. The day is said as "todo dia 8", which is how a person says it, and the arrow says
 * the row opens.
 */
function Row({ c, today }: { c: Commitment; today: string }) {
  return (
    <Press
      onPress={() => router.push({ pathname: '/recorrencia', params: { id: c.series.id } })}
      style={styles.row}
      accessibilityLabel={`${c.series.title}, todo dia ${c.series.dayOfMonth}`}
    >
      <View style={styles.rowText}>
        <Txt variant="body" numberOfLines={1}>
          {c.series.title}
        </Txt>
        <Txt variant="micro" t="faint" numberOfLines={1}>
          {`todo dia ${c.series.dayOfMonth} · ${c.series.category}`}
        </Txt>
        <Txt variant="micro" t="faint" numberOfLines={1}>
          <Txt variant="micro" f="mono" t="muted" tabular>
            {brlShort(c.yearCents)}
          </Txt>
          {' por ano'}
          {ends(c, today) ? ` · acaba em ${ends(c, today)}` : ''}
        </Txt>
      </View>
      <FlowAmount cents={c.monthlyCents} direction={c.series.direction} />
      <View style={styles.chevron}>
        <ChevronRight size={16} tint={color.inkFaint} />
      </View>
    </Press>
  );
}

/** Debts both ways: what you owe and what you are owed, each counted in installments. */
function Parcelas({ view, today }: { view: Commitments; today: string }) {
  if (view.debts.length === 0 && view.receivables.length === 0) {
    return (
      <Empty
        text="Uma compra parcelada, um empréstimo, um dinheiro que alguém te devolve aos poucos: tudo o que tem número de parcelas."
        action="Cadastrar um parcelamento"
        shape="debt"
      />
    );
  }
  const ladder = (d: Commitment, i: number, delay: number, label: string) => (
    <Animated.View key={d.series.id} layout={listLayout} exiting={rowOut}>
      <Press
        onPress={() => openDebt(d.series.id, d.series.linkedShareToken)}
        style={styles.debt}
        accessibilityLabel={label}
      >
        <DebtLadder
          debt={{
            series: d.series,
            paid: d.series.paidCount,
            total: d.series.totalCount ?? 0,
            remainingCents: d.remaining?.cents ?? 0,
            finishes: d.remaining?.finishes ?? today,
          }}
          index={i}
          delay={delay}
        />
      </Press>
    </Animated.View>
  );
  return (
    <>
      {view.debts.length > 0 ? (
        <>
          <Section
            label="você deve"
            aside={brlShort(view.debts.reduce((n, d) => n + (d.remaining?.cents ?? 0), 0))}
          />
          {view.debts.map((d, i) => ladder(d, i, 120, d.series.title))}
        </>
      ) : null}
      {view.receivables.length > 0 ? (
        <>
          <Section
            label="você recebe"
            aside={brlShort(view.receivables.reduce((n, d) => n + (d.remaining?.cents ?? 0), 0))}
          />
          {view.receivables.map((d, i) =>
            ladder(d, i, 180, `${d.series.title}, a receber de ${d.series.counterparty ?? 'outra pessoa'}`),
          )}
        </>
      ) : null}
    </>
  );
}

/**
 * An empty kind is the most likely first sight of this screen, so it teaches rather than apologises:
 * what belongs here, in examples a person recognises, and the door straight into adding one — already
 * pointed at this kind, so the first step of the flow is skipped.
 */
function Empty({ text, action, shape }: { text: string; action: string; shape: 'out' | 'in' | 'debt' }) {
  return (
    <View style={styles.empty}>
      <Txt variant="body" t="muted">
        {text}
      </Txt>
      <Press
        onPress={() => router.push({ pathname: '/recorrencia', params: { shape } })}
        style={styles.emptyAction}
        accessibilityLabel={action}
      >
        <Txt variant="body" f="sansMedium">
          {action}
        </Txt>
        <ChevronRight tint={color.inkMuted} />
      </Press>
    </View>
  );
}

function openDebt(id: string, token: string | null) {
  if (token) router.push({ pathname: '/divida/[token]' as never, params: { token } });
  else router.push({ pathname: '/recorrencia', params: { id } });
}

/**
 * When a series that does not fill the year runs out.
 *
 * Only an end date can shorten a non-debt series — an installment count is what shortens a debt, and
 * debts are drawn in their own place and never reach here. So this reads `endDate` and does not
 * invent a fallback.
 */
function ends(c: Commitment, today: string): string | null {
  if (!c.series.endDate || c.series.endDate < today) return null;
  return format(parseDay(c.series.endDate), "MMMM 'de' yyyy", { locale: ptBR });
}

/** A group boundary: a rule, the label under it, and the figure the group adds up to. */
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // The page grows to the bottom of the screen, so a short kind can still be swiped anywhere.
  scroll: { flexGrow: 1, paddingTop: space.md, paddingBottom: space.xxxl },
  page: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { paddingTop: space.xl },
  notice: { paddingTop: space.lg },

  hero: { paddingTop: space.xl },
  heroLabel: { paddingTop: space.xs },
  heroNote: { paddingTop: space.sm },
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: space.lg,
    backgroundColor: color.hairline,
    overflow: 'hidden',
  },
  used: { height: 4, borderRadius: 2 },

  add: { paddingTop: space.xl },
  tabs: { paddingTop: space.xl },

  section: { paddingTop: space.xl },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
  },
  sectionLabel: { letterSpacing: 0.8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, paddingRight: space.md },
  chevron: { paddingLeft: space.sm },

  debt: { paddingVertical: 0 },

  empty: { paddingTop: space.xl },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
});
