import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { forecastRoute } from '@/lib/nav';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Svg, { Line } from 'react-native-svg';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Wordmark } from '@/ui/Wordmark';
import { Amount } from '@/ui/Amount';
import { useTabBarClearance } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { SwipeRow } from '@/ui/SwipeRow';
import { Press } from '@/ui/Press';
import { Txt } from '@/theme/text';
import { color, space, type } from '@/theme/tokens';
import { useSnackbar } from '@/ui/Snackbar';
import { useLedger } from '@/state/ledger';
import { deleteEntry } from '@/db/repo';
import { saidPlainly } from '@/lib/errors';
import { dayKey, ledgerTape, parseDay, type TapeDay, type TapeItem } from '@/domain/projection';
import { brl } from '@/domain/money';
import type { Direction } from '@/domain/model';

/**
 * The ledger, unfolded.
 *
 * The home screen argues that it needs no list of upcoming bills because "each step of the projected
 * half already is that list". That is true of the shape, and it is why this screen exists: the shape
 * says *how much* and *when*, and it cannot say *what*. So this is the same line read as names — one
 * continuous tape with no month boundary in it, because a bill due on the 2nd is the next thing
 * after a bill due on the 30th, and a list that stops at the edge of a month makes the owner do the
 * joining.
 *
 * **The authored idea: the day's rule sticks to the top carrying the balance at that point.** Every
 * other screen in this app draws a rule to say "a group starts here"; here that rule also holds the
 * running figure, and it stays under your thumb while the day's rows pass beneath it. Scrolling the
 * ledger is dragging your finger along the curve the home screen draws. The grammar is the same
 * grammar, too: the rule is solid over a day that happened and dashed over one still forecast,
 * exactly as the curve is solid behind today and dashed ahead of it.
 *
 * There is one seam, and it is today — drawn in ink, the single place on this screen where a rule is
 * allowed to be brighter than a hairline.
 *
 * **The tape can arrive cut, and only ever on arrival.** The home screen's two totals are claims
 * about one direction of one month, and the owner who touches "a pagar" is asking to see those
 * movements — not a month with the answer mixed into it. So a `focus` param cuts the tape to one
 * direction. This does not retract the argument above: the ledger's own state is the whole tape,
 * the cut is something another screen hands it, and it says so in the masthead with a way to drop
 * it in one tap. What is never allowed is a cut the owner cannot see or undo.
 *
 * A cut tape also stops carrying a running balance. The figure on a day's rule is the balance
 * across *all* movements, and printing it beside half of them would be a number describing rows
 * that are not there. Filtered, the rule carries the day's total in the direction being read —
 * same geometry, a claim that matches what is under it.
 */
export default function Razao() {
  return (
    <Screen bottomInset={false}>
      <RazaoBody />
    </Screen>
  );
}

type Row =
  | { type: 'day'; key: string; day: TapeDay; today: boolean }
  | { type: 'item'; key: string; item: TapeItem }
  | { type: 'carry'; key: string; cents: number };

function RazaoBody() {
  const clearance = useTabBarClearance();
  // One arrival for all four tabs, carrying the direction of the move that produced it.
  const ENTER = useTabEntrance();
  const snack = useSnackbar();

  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const load = useLedger((s) => s.load);
  const accounts = useLedger((s) => s.accounts);
  const series = useLedger((s) => s.series);
  const entries = useLedger((s) => s.entries);
  const deferrals = useLedger((s) => s.deferralsBySlot);

  const list = useRef<FlatList<Row>>(null);
  const [ruleWidth, setRuleWidth] = useState(0);

  useEffect(() => {
    void load();
  }, [load]);

  // Read once per mount. A date recomputed inside a render makes every derived value a new object.
  const today = useMemo(() => dayKey(new Date()), []);

  /**
   * Where to open, when someone sent us somewhere.
   *
   * A total on the home screen belongs to a month as well as to a direction, so the tap carries
   * both: `focus` cuts the tape, `at` says where to open it. Landing on today in a cut tape would
   * answer the wrong month — the owner may well have been reading November.
   *
   * Read on mount and not after, because that is the only moment `initialScrollIndex` is consulted.
   */
  const { at, focus } = useLocalSearchParams<{ at?: string; focus?: string }>();
  const land = useMemo(() => {
    const day = Array.isArray(at) ? at[0] : at;
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  }, [at, today]);

  /**
   * The direction the tape is cut to, or null for the whole ledger.
   *
   * The param *is* the state, rather than seeding a `useState` beside it. Two copies of one fact
   * get out of step in both directions here: the screen is a tab, so it can stay mounted while the
   * owner leaves and comes back through the bar with no `focus` at all — a filter still set from a
   * visit ten minutes ago, with nothing on screen explaining how it got there — and arriving twice
   * on the same direction would not change a seeded state at all, so the second tap on "a pagar"
   * would do nothing.
   *
   * Dropping the filter therefore clears the param rather than a local flag. That also has to be
   * possible without navigating: the owner got here by touching a total, and making them go back
   * to the home screen to see everything would turn the cut into a trap.
   */
  const arrived = Array.isArray(focus) ? focus[0] : focus;
  const cut: Direction | null = arrived === 'in' || arrived === 'out' ? arrived : null;
  const clearCut = () => router.setParams({ focus: '' });

  /*
   * Where an anticipated settlement lands.
   *
   * Which accounts an antecipação may land in — never a card, the same rule the balance obeys. A
   * credit line is not money, and money that just arrived cannot arrive into one. A forecast booked
   * outside this set keeps no gesture: an antecipação with nowhere to land is not an action, it is a
   * failure waiting to be reported.
   */
  const holding = useMemo(
    () => new Set(accounts.filter((a) => a.kind !== 'card').map((a) => a.id)),
    [accounts],
  );

  /**
   * Row heights are fixed on purpose, and computed from the type scale rather than typed in.
   *
   * `getItemLayout` is what lets this screen open on today instead of at the top of history, and it
   * is only honest if the number it reports is the number the row actually takes. Hardcoding 56 here
   * would be right at font scale 1 and a lie at 1.3 — the list would land near today rather than on
   * it, and the further back the ledger reached the further off it would land. So the arithmetic
   * that sizes the row is the arithmetic that estimates it, and every label inside is held to one
   * line.
   */
  const { fontScale } = useWindowDimensions();
  const H = useMemo(
    () => ({
      day: Math.ceil(1 + space.sm * 2 + 4 + type.label.leading * fontScale),
      item: Math.ceil(space.sm * 2 + (type.body.leading + type.micro.leading) * fontScale),
    }),
    [fontScale],
  );

  const tape = useMemo(() => {
    if (!ready || error) return null;

    // The same evidence-bounded window the home screen navigates: back to the first month the ledger
    // has anything to say about, forward to as far as projecting stays honest.
    const first = entries.reduce<string | null>(
      (min, e) => (min === null || e.date < min ? e.date : min),
      null,
    );
    const t = parseDay(today);
    const from = dayKey(startOfMonth(first ? parseDay(first) : t));
    const to = dayKey(endOfMonth(addMonths(t, 6)));

    const full = ledgerTape(accounts, entries, series, today, from, to, deferrals);
    if (!cut) return full;

    /*
     * Cut here rather than inside `plan`, so every measurement downstream — the offsets, the sticky
     * indices, the row the list opens on — is taken from the tape the owner is actually looking at.
     * Filtering later would leave `getItemLayout` describing rows that are no longer rendered, and
     * the list would land somewhere near the right day instead of on it.
     *
     * A day with nothing in this direction is dropped whole. Keeping it would be the filter
     * refusing to do the one thing it is for. `moved` is replaced by the day's total in this
     * direction, unsigned: it is what the rule prints now that the running balance cannot honestly
     * stand there.
     */
    return full
      .map((day) => {
        const items = day.items.filter((it) => it.direction === cut);
        return { ...day, items, moved: items.reduce((n, it) => n + it.amountCents, 0) };
      })
      .filter((day) => day.items.length > 0);
  }, [ready, error, accounts, entries, series, deferrals, today, cut]);

  /** The tape flattened into rows, with the offsets and sticky indices the list needs. */
  const plan = useMemo(() => {
    if (!tape) return null;

    const rows: Row[] = [];
    const sticky: number[] = [];
    const offsets: number[] = [];
    let y = 0;
    let landRow: number | null = null;

    for (const day of tape) {
      sticky.push(rows.length);
      if (landRow === null && day.date >= land) landRow = rows.length;

      offsets.push(y);
      y += H.day;
      rows.push({ type: 'day', key: day.date, day, today: day.date === today });

      /*
       * What was already late at today, counted on the first day the forecast owns. Without a row
       * of its own the balance on that day jumped by the overdue total with nothing under the rule
       * to account for it — the one place the column could not be checked by adding it up. Same
       * height as an item, so the offsets stay exact. A cut tape carries no running balance, so it
       * has nothing here to explain.
       */
      if (!cut && day.carried !== 0) {
        offsets.push(y);
        y += H.item;
        rows.push({ type: 'carry', key: day.date + '/carried', cents: day.carried });
      }

      for (const item of day.items) {
        offsets.push(y);
        y += H.item;
        rows.push({ type: 'item', key: day.date + '/' + item.key, item });
      }
    }

    return { rows, sticky, offsets, landRow: landRow ?? 0 };
  }, [tape, land, today, H, cut]);

  /*
   * Changing the cut re-anchors the list.
   *
   * `initialScrollIndex` is read once, at mount, so dropping the filter would leave the viewport
   * at an offset measured against a tape that no longer exists — the owner taps "ver tudo" and
   * arrives in March. Re-landing on the same day they were sent to keeps the month under the thumb
   * while the rows around it change, which is the only thing that should change.
   *
   * `plan` is read through a ref so this fires on the cut and not on every reload of the ledger.
   */
  const planRef = useRef(plan);
  planRef.current = plan;
  const anchored = useRef(false);
  useEffect(() => {
    if (!anchored.current) {
      anchored.current = true;
      return;
    }
    const p = planRef.current;
    if (!p || p.rows.length === 0) return;
    list.current?.scrollToIndex({
      index: Math.min(p.landRow, p.rows.length - 1),
      animated: false,
    });
  }, [cut]);

  const horizon = useMemo(
    () => format(endOfMonth(addMonths(parseDay(today), 6)), "MMMM 'de' yyyy", { locale: ptBR }),
    [today],
  );

  const onRule = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setRuleWidth((prev) => (prev === w ? prev : w));
  };

  return (
    <>
      <Reveal index={0} {...ENTER.head}>
        <View style={styles.top} onLayout={onRule}>
          <Wordmark height={22} animate alive />
          {/*
            The masthead states the cut and is how it is dropped. A filter the owner can see but
            not undo is a trap, and the caption slot is already the screen saying what it is
            showing — so a cut tape simply says something different there. `ink` on the verb,
            because it is the one word on this screen that is a control.
          */}
          {cut ? (
            <Press onPress={clearCut} accessibilityLabel="Ver o razão inteiro">
              <Txt variant="micro" t="faint">
                só {cut === 'out' ? 'saídas' : 'entradas'} ·{' '}
                <Txt variant="micro" t="ink">
                  ver tudo
                </Txt>
              </Txt>
            </Press>
          ) : (
            <Txt variant="micro" t="faint">
              passado e previsto, na mesma coluna
            </Txt>
          )}
        </View>
      </Reveal>

      {!ready && !error ? (
        <Reveal index={1} {...ENTER.body}>
          <Txt variant="body" t="faint" style={styles.notice}>
            lendo seu razão
          </Txt>
        </Reveal>
      ) : null}

      {error ? (
        <Reveal index={1} {...ENTER.body}>
          <Txt variant="heading" f="sansSemibold" style={styles.head}>
            Não consegui ler seus dados.
          </Txt>
          <Txt variant="body" t="muted" style={styles.notice}>
            {error}
          </Txt>
        </Reveal>
      ) : null}

      {plan && plan.rows.length === 0 ? (
        <Reveal index={1} {...ENTER.body}>
          <Txt variant="body" t="faint" style={styles.notice}>
            Nada lançado ainda. O que você registrar aparece aqui, em ordem.
          </Txt>
        </Reveal>
      ) : null}

      {plan && plan.rows.length > 0 ? (
        <FlatList
          ref={list}
          style={styles.flex}
          data={plan.rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item: row }) =>
            row.type === 'day' ? (
              <DayRule
                day={row.day}
                today={row.today}
                height={H.day}
                width={ruleWidth}
                cut={cut}
                year={today.slice(0, 4)}
              />
            ) : row.type === 'carry' ? (
              <CarriedRow cents={row.cents} height={H.item} />
            ) : (
              <ItemRow
                item={row.item}
                height={H.item}
                holding={holding}
                onDelete={async (id) => {
                  try {
                    await deleteEntry(id);
                    void load();
                    snack('Lançamento excluído.', 'info');
                  } catch (e) {
                    snack(saidPlainly(e), 'error');
                  }
                }}
              />
            )
          }
          /*
           * The whole idea of the screen. If the platform ever declines to honour it, the headers
           * scroll like everything else — a plainer ledger, not a broken one.
           */
          stickyHeaderIndices={plan.sticky}
          getItemLayout={(_, index) => ({
            length: plan.rows[index]?.type === 'day' ? H.day : H.item,
            offset: plan.offsets[index] ?? 0,
            index,
          })}
          /* Opening at the top would open in history. The ledger opens where the owner is — or
             where they were sent, when a total on the home screen sent them to a month. */
          initialScrollIndex={plan.landRow}
          onScrollToIndexFailed={({ index }) => {
            // Only reachable if the measured layout ever disagrees with `getItemLayout`. Landing at
            // an approximate offset beats landing at the beginning of time.
            list.current?.scrollToOffset({ offset: plan.offsets[index] ?? 0, animated: false });
          }}
          initialNumToRender={24}
          windowSize={9}
          /*
           * Off, and stated rather than omitted, because Android's VirtualizedList turns it on by
           * default. Clipping and sticky headers are a known bad pair there: the pinned row blanks
           * out as it is clipped, which is a hole in the ledger, not a plainer ledger. With fixed
           * row heights and `getItemLayout` over a couple of hundred rows it buys nothing anyway.
           */
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          /*
           * The tape stops where projecting stops being honest, and it says so. Ending on the last
           * forecast with nothing under it read as the ledger running out, not as a decision.
           * A footer rather than a header, because it sits after every measured row and so cannot
           * move an offset `getItemLayout` reports.
           */
          ListFooterComponent={
            <Txt variant="micro" t="faint" style={styles.end}>
              {`A previsão vai até ${horizon}. Depois disso, OTTO não arrisca um número.`}
            </Txt>
          }
          contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}
        />
      ) : (
        <View style={styles.flex} />
      )}
    </>
  );
}

/**
 * The day, and where the money stands at the close of it.
 *
 * Solid rule for a day that happened, dashed for one still forecast — the same distinction the
 * balance curve makes, drawn with the same dash. Today is the seam and gets ink.
 *
 * The dashed rule is an SVG line rather than `borderStyle: 'dashed'`, which Android renders
 * inconsistently at hairline widths. Until the width has been measured it falls back to a solid
 * faint rule: a day whose dash has not arrived still has to read as a day.
 */
function DayRule({
  day,
  today,
  height,
  width,
  cut,
  year,
}: {
  /** The direction the tape is cut to, when it is. Changes what the rule's figure means. */
  cut: Direction | null;
  day: TapeDay;
  today: boolean;
  height: number;
  width: number;
  /** The current year. A day in any other one prints its year — see below. */
  year: string;
}) {
  const d = parseDay(day.date);
  /*
   * The tape runs from last year's history to next year's forecast with no month boundary in it, so
   * "08 MAR" alone could be either March. The year is printed only when it is not this one: the
   * common case stays short, and the stamp that would be ambiguous is the one that says more.
   *
   * Figures in mono, words in sans — the weekday used to be set in mono capitals like a number. The
   * capitals stay: this is a group label, in the same sans caps as every section heading.
   */
  const dd = format(d, 'dd');
  const month = format(d, 'MMM', { locale: ptBR }).toUpperCase().replace('.', '');
  const otherYear = day.date.slice(0, 4) !== year ? day.date.slice(0, 4) : null;
  const weekday = format(d, 'EEEE', { locale: ptBR }).split('-')[0] as string;
  const tone = today ? 'ink' : 'faint';

  return (
    <View style={[styles.dayRow, { height }]}>
      {day.actual || width === 0 ? (
        <View
          style={[
            styles.rule,
            !day.actual ? styles.ruleFaint : null,
            today ? styles.ruleToday : null,
          ]}
        />
      ) : (
        <Svg width={width} height={1}>
          <Line
            x1={0}
            y1={0.5}
            x2={width}
            y2={0.5}
            stroke={color.hairlineStrong}
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        </Svg>
      )}

      <View style={styles.dayLine}>
        <Txt variant="micro" f="sansMedium" t={tone} numberOfLines={1} style={styles.stamp}>
          <Txt variant="micro" f="monoMedium" t={tone} tabular>
            {dd}
          </Txt>
          {' ' + month}
          {otherYear ? ' ' : null}
          {otherYear ? (
            <Txt variant="micro" f="monoMedium" t={tone} tabular>
              {otherYear}
            </Txt>
          ) : null}
          {'  ·  ' + (today ? 'HOJE' : weekday.toUpperCase())}
        </Txt>
        {/*
          The running figure. Faint while it is forecast, because a projected balance is a different
          kind of claim from a recorded one and the reader should not have to remember which.

          Cut, it is the day's total in the direction being read instead — see the note at the top
          of this file. A running balance printed beside half a day's movements would be a figure
          describing rows that are not on screen, which is the one thing a filter must not do. The
          tone follows the direction rather than the sign, because in a cut tape every figure is the
          same kind of money and `negative` would mean nothing but "this is the saídas page".

          The word in front says which of the two it is. A bare number in the rule's corner was
          read as either.
        */}
        <View style={styles.figure}>
          <Txt variant="micro" t="faint" numberOfLines={1}>
            {cut ? 'no dia ' : 'saldo '}
          </Txt>
          <Txt
            variant="label"
            f="monoMedium"
            t={
              cut
                ? day.actual
                  ? 'muted'
                  : 'faint'
                : day.balance < 0
                  ? 'negative'
                  : day.actual
                    ? 'muted'
                    : 'faint'
            }
            tabular
            numberOfLines={1}
          >
            {cut ? (cut === 'in' && day.moved > 0 ? '+' : '') + brl(day.moved) : brl(day.balance)}
          </Txt>
        </View>
      </View>
    </View>
  );
}

/**
 * The overdue total, on the day it is counted.
 *
 * The rows it sums are drawn on the days they were due and move nothing there; this is where the
 * forecast counts them (see `TapeDay.carried`). A readout and not a control — it is a sum of rows
 * that each open on their own day.
 */
function CarriedRow({ cents, height }: { cents: number; height: number }) {
  const out = cents < 0;
  return (
    <View
      style={[styles.itemRow, { height }]}
      accessible
      accessibilityLabel={`Atrasados de antes, ${out ? '' : 'mais '}${brl(Math.abs(cents))}, contados neste dia`}
    >
      <View style={styles.itemName}>
        <Txt variant="body" t="muted" numberOfLines={1}>
          atrasados de antes
        </Txt>
        <Txt variant="micro" t="warning" numberOfLines={1}>
          vencidos e não recebidos, contados aqui
        </Txt>
      </View>
      <Amount
        cents={cents}
        direction={out ? 'out' : 'in'}
        size="body"
        tone={out ? 'negative' : 'positive'}
      />
    </View>
  );
}

/**
 * One movement, named. The figure holds its own column because it is tabular and right-aligned.
 *
 * The two kinds of row swipe to different things, because they *are* different things. A settled row
 * is an `Entry`: `item.key` is its real id, and it can be edited or deleted. A forecast has no row
 * behind it — its key is the synthetic `seriesId@date` — so "excluir" would be apagando nothing and
 * the next read would project it right back. What a forecast can do instead is stop being one.
 */
function ItemRow({
  item,
  height,
  holding,
  onDelete,
}: {
  item: TapeItem;
  height: number;
  /** The accounts that actually hold money — the only ones an antecipação may land in. */
  holding: Set<string>;
  onDelete: (id: string) => Promise<void>;
}) {
  /*
   * Excluir asks twice, the way lançar's "Apagar lançamento" does. The swipe is a gesture a thumb
   * makes by accident while scrolling the tape, so swipe-then-tap was one slip away from a lost
   * lançamento with no way back — the snackbar is a readout that takes no touches, so there is no
   * Desfazer to offer instead. The first tap keeps the strip open and turns the action into
   * "confirmar"; it stands down on its own after a few seconds.
   */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  /*
   * An installment says which one it is before anything else — that is the whole reason it is
   * numbered, and with deferral two of them can land on one day. Everything else is told by the
   * state it is in: recorded, late, or still ahead.
   */
  const state = item.settled
    ? item.time
      ? ' · ' + item.time
      : ''
    : item.overdue
      ? item.direction === 'in'
        ? ' · não recebido'
        : ' · vencido'
      : ' · previsto';

  const note = item.installment
    ? item.category + ' · parcela ' + item.installment.n + '/' + item.installment.of + state
    : item.category + state;

  const body = (
    <View style={[styles.itemRow, { height }]}>
      <View style={styles.itemName}>
        <Txt variant="body" t={item.settled ? 'ink' : 'muted'} numberOfLines={1}>
          {item.title}
        </Txt>
        {/* Late is warning, the way the Home draws it. In faint it read as one more "previsto". */}
        <Txt variant="micro" t={item.overdue ? 'warning' : 'faint'} numberOfLines={1}>
          {note}
        </Txt>
      </View>
      <Amount
        cents={item.amountCents}
        direction={item.direction}
        size="body"
        tone={item.direction === 'out' ? 'negative' : 'positive'}
      />
    </View>
  );

  /*
   * A forecast gets one action, and it is not editar or excluir.
   *
   * There is no row behind it to edit and nothing to delete — the next read would project it
   * straight back. What it *can* do is stop being a forecast: "recebi hoje, mesmo que a regra diga
   * dia 5". That records the money on today and retires this occurrence, so the rule's next turn is
   * next month, on the day the owner set. Nothing about the series changes, which is why deleting
   * the lançamento brings the forecast back exactly where it was.
   *
   * **It opens the keypad rather than writing the settlement here.** A rule states what it expects;
   * what actually arrived is a separate fact, and the two agreeing is a common case, not a
   * guarantee. Settling silently at the forecast figure meant a bônus that came in at 1.150 was
   * recorded as 1.300 with no moment at which the owner could say otherwise. So the gesture hands
   * the occurrence to `lançar`, already filled in — one more tap when the number is right, and the
   * only path there is when it is not.
   */
  if (!item.settled) {
    // A rule booked against a card settles nowhere the balance can see, so it gets no gesture at
    // all: an antecipação that lands on a credit line is not an antecipação, it is a wrong number.
    if (!item.occurrence || !holding.has(item.occurrence.accountId)) return body;
    const { seriesId, scheduled } = item.occurrence;
    return (
      <SwipeRow
        height={height}
        label={`Antecipar ${item.title}`}
        actions={[
          {
            label: item.direction === 'in' ? 'recebi' : 'paguei',
            tone: 'muted',
            onPress: () =>
              router.push({
                pathname: '/lancar',
                params: { settlesSeries: seriesId, settlesDate: scheduled },
              }),
          },
        ]}
        onPress={() => router.push(forecastRoute(seriesId, scheduled))}
      >
        {body}
      </SwipeRow>
    );
  }

  return (
    <SwipeRow
      height={height}
      label="Editar lançamento"
      actions={[
        {
          label: 'editar',
          tone: 'muted',
          onPress: () => router.push({ pathname: '/lancar', params: { id: item.key } }),
        },
        {
          label: armed ? 'confirmar' : 'excluir',
          tone: 'negative',
          warn: armed,
          keepOpen: !armed,
          onPress: () => {
            if (!armed) {
              setArmed(true);
              return;
            }
            setArmed(false);
            void onDelete(item.key);
          },
        },
      ]}
      onPress={() => router.push({ pathname: '/lancar', params: { id: item.key } })}
    >
      {body}
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: space.xxl },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  head: { paddingTop: space.xl },
  notice: { paddingTop: space.lg },

  /* The sticky row must be opaque, or the rows passing under it show through its own figure. */
  dayRow: { backgroundColor: color.bg, justifyContent: 'flex-start' },
  rule: { height: 1, backgroundColor: color.hairline },
  ruleFaint: { backgroundColor: color.hairlineStrong, opacity: 0.5 },
  ruleToday: { backgroundColor: color.ink, opacity: 0.9 },
  dayLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xs,
  },
  stamp: { letterSpacing: 0.8, flexShrink: 1, paddingRight: space.md },
  figure: { flexDirection: 'row', alignItems: 'baseline' },
  end: { paddingTop: space.xl, paddingBottom: space.lg },

  itemRow: { flexDirection: 'row', alignItems: 'center' },
  itemName: { flex: 1, paddingRight: space.lg },
});
