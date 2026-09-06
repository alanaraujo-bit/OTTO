import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { router } from 'expo-router';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Svg, { Line } from 'react-native-svg';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Wordmark } from '@/ui/Wordmark';
import { Amount } from '@/ui/Amount';
import { TabBar } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { SwipeRow } from '@/ui/SwipeRow';
import { Txt } from '@/theme/text';
import { color, space, type } from '@/theme/tokens';
import { useSnackbar } from '@/ui/Snackbar';
import { saidPlainly } from '@/lib/errors';
import { useLedger } from '@/state/ledger';
import * as Crypto from 'expo-crypto';
import { deleteEntry, settleOccurrence } from '@/db/repo';
import { dayKey, ledgerTape, parseDay, type TapeDay, type TapeItem } from '@/domain/projection';
import { brl } from '@/domain/money';

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
  | { type: 'item'; key: string; item: TapeItem };

function RazaoBody() {
  // One arrival for all four tabs, carrying the direction of the move that produced it.
  const ENTER = useTabEntrance();
  const snack = useSnackbar();

  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const load = useLedger((s) => s.load);
  const accounts = useLedger((s) => s.accounts);
  const series = useLedger((s) => s.series);
  const entries = useLedger((s) => s.entries);

  const list = useRef<FlatList<Row>>(null);
  const [ruleWidth, setRuleWidth] = useState(0);

  useEffect(() => {
    void load();
  }, [load]);

  // Read once per mount. A date recomputed inside a render makes every derived value a new object.
  const today = useMemo(() => dayKey(new Date()), []);

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

    return ledgerTape(accounts, entries, series, today, from, to);
  }, [ready, error, accounts, entries, series, today]);

  /** The tape flattened into rows, with the offsets and sticky indices the list needs. */
  const plan = useMemo(() => {
    if (!tape) return null;

    const rows: Row[] = [];
    const sticky: number[] = [];
    const offsets: number[] = [];
    let y = 0;
    let todayRow: number | null = null;

    for (const day of tape) {
      sticky.push(rows.length);
      if (todayRow === null && day.date >= today) todayRow = rows.length;

      offsets.push(y);
      y += H.day;
      rows.push({ type: 'day', key: day.date, day, today: day.date === today });

      for (const item of day.items) {
        offsets.push(y);
        y += H.item;
        rows.push({ type: 'item', key: day.date + '/' + item.key, item });
      }
    }

    return { rows, sticky, offsets, todayRow: todayRow ?? 0 };
  }, [tape, today, H]);

  const onRule = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setRuleWidth((prev) => (prev === w ? prev : w));
  };

  return (
    <>
      <Reveal index={0} {...ENTER.head}>
        <View style={styles.top} onLayout={onRule}>
          <Wordmark height={22} animate alive />
          <Txt variant="micro" t="faint">
            passado e previsto, na mesma coluna
          </Txt>
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
              <DayRule day={row.day} today={row.today} height={H.day} width={ruleWidth} />
            ) : (
              <ItemRow
                item={row.item}
                height={H.item}
                holding={holding}
                today={today}
                onDeleted={() => {
                  void load();
                  snack('Lançamento apagado.', 'info');
                }}
                onSettled={(item) => {
                  void load();
                  snack(
                    (item.direction === 'in' ? 'Recebido' : 'Pago') +
                      ' hoje. A próxima volta no mês que vem.',
                    'info',
                  );
                }}
                onFailed={(e) => snack(saidPlainly(e), 'error')}
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
          /* Opening at the top would open in history. The ledger opens where the owner is. */
          initialScrollIndex={plan.todayRow}
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
          contentContainerStyle={styles.scroll}
        />
      ) : (
        <View style={styles.flex} />
      )}

      <TabBar
        active="ledger"
        onCapture={() => router.push('/lancar')}
      />
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
}: {
  day: TapeDay;
  today: boolean;
  height: number;
  width: number;
}) {
  const d = parseDay(day.date);
  const stamp = format(d, 'dd MMM', { locale: ptBR }).toUpperCase();
  const weekday = format(d, 'EEE', { locale: ptBR }).toUpperCase().replace('.', '');

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
        <Txt
          variant="micro"
          f="monoMedium"
          t={today ? 'ink' : 'faint'}
          numberOfLines={1}
          style={styles.stamp}
        >
          {stamp + '  ·  ' + (today ? 'HOJE' : weekday)}
        </Txt>
        {/*
          The running figure. Faint while it is forecast, because a projected balance is a different
          kind of claim from a recorded one and the reader should not have to remember which.
        */}
        <Txt
          variant="label"
          f="monoMedium"
          t={day.balance < 0 ? 'negative' : day.actual ? 'muted' : 'faint'}
          tabular
          numberOfLines={1}
        >
          {brl(day.balance)}
        </Txt>
      </View>
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
  today,
  holding,
  onDeleted,
  onSettled,
  onFailed,
}: {
  item: TapeItem;
  height: number;
  today: string;
  /** The accounts that actually hold money — the only ones an antecipação may land in. */
  holding: Set<string>;
  onDeleted: () => void;
  onSettled: (item: TapeItem) => void;
  onFailed: (e: unknown) => void;
}) {
  const note = item.installment
    ? item.category + ' · parcela ' + item.installment.n + '/' + item.installment.of
    : item.settled
      ? item.category
      : item.category + ' · previsto';

  const body = (
    <View style={[styles.itemRow, { height }]}>
      <View style={styles.itemName}>
        <Txt variant="body" t={item.settled ? 'ink' : 'muted'} numberOfLines={1}>
          {item.title}
        </Txt>
        <Txt variant="micro" t="faint" numberOfLines={1}>
          {note}
        </Txt>
      </View>
      <Amount
        cents={item.direction === 'out' ? -item.amountCents : item.amountCents}
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
   */
  if (!item.settled) {
    // A rule booked against a card settles nowhere the balance can see, so it gets no gesture at
    // all: an antecipação that lands on a credit line is not an antecipação, it is a wrong number.
    if (!item.occurrence || !holding.has(item.occurrence.accountId)) return body;
    const { seriesId, scheduled, accountId } = item.occurrence;
    return (
      <SwipeRow
        height={height}
        label={`Antecipar ${item.title}`}
        actions={[
          {
            label: item.direction === 'in' ? 'recebi' : 'paguei',
            tone: 'muted',
            onPress: () => {
              void settleOccurrence(seriesId, scheduled, {
                id: Crypto.randomUUID(),
                date: today,
                amountCents: item.amountCents,
                direction: item.direction,
                title: item.title,
                category: item.category,
                accountId,
              })
                .then(() => onSettled(item))
                .catch(onFailed);
            },
          },
        ]}
        onPress={() => router.push({ pathname: '/recorrencia', params: { id: seriesId } })}
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
          label: 'excluir',
          tone: 'negative',
          warn: true,
          onPress: () => {
            void deleteEntry(item.key).then(onDeleted);
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
  stamp: { letterSpacing: 1.1 },

  itemRow: { flexDirection: 'row', alignItems: 'center' },
  itemName: { flex: 1, paddingRight: space.lg },
});
