import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { MonthStepper } from '@/ui/MonthStepper';
import { Press } from '@/ui/Press';
import { Amount } from '@/ui/Amount';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useLedger } from '@/state/ledger';
import { dayKey, parseDay, project } from '@/domain/projection';
import { keyOf, settled } from '@/domain/settlement';
import { signed, type Direction, type SeriesKind } from '@/domain/model';
import { brlShort } from '@/domain/money';

type DayState = 'settled' | 'forecast' | 'pending';

type CalendarItem = {
  key: string;
  title: string;
  category: string;
  amountCents: number;
  direction: Direction;
  state: DayState;
  kind: SeriesKind | 'entry';
  installment: { n: number; of: number } | null;
  /** The hour the owner gave this lançamento. Null on every projection — nothing has an hour until
      it has happened. */
  time: string | null;
};

type CalendarDay = {
  date: string;
  items: CalendarItem[];
  moved: number;
  pending: boolean;
};

/** A month is a map before it is a grid: every day has one truthful, named reading. */
function calendarDays(
  entries: ReturnType<typeof useLedger.getState>['entries'],
  series: ReturnType<typeof useLedger.getState>['series'],
  from: string,
  to: string,
  today: string,
  deferrals: ReturnType<typeof useLedger.getState>['deferralsBySlot'],
) {
  const byDate = new Map<string, CalendarItem[]>();
  const put = (date: string, item: CalendarItem) => {
    const existing = byDate.get(date);
    if (existing) existing.push(item);
    else byDate.set(date, [item]);
  };

  const done = settled(entries);

  for (const entry of entries) {
    if (entry.date < from || entry.date > to) continue;
    const rule = entry.seriesId ? series.find((item) => item.id === entry.seriesId) : null;
    put(entry.date, {
      key: entry.id,
      title: entry.title,
      category: entry.category,
      amountCents: entry.amountCents,
      direction: entry.direction,
      state: 'settled',
      kind: rule?.kind ?? 'entry',
      installment: null,
      time: entry.time,
    });
  }

  // `project` already drops anything an entry has settled, by the same key every other screen
  // uses. The check that used to live here compared `entry.date` to `occurrence.date`, which was
  // right only while nothing was ever paid early — and paying early is now a thing the app does.
  for (const occurrence of project(series, from, to, done, deferrals)) {
    /*
     * A projection is never claimed as fact, but a day that has passed with nothing settling it is
     * not a forecast either — it is still owed, and that is the state this calendar exists to make
     * visible.
     *
     * This used to admit only debts and silently drop every other kind, so a rent that went unpaid
     * left no mark anywhere. Every kind is admitted now, inflows included: a salary that did not
     * arrive is not a debt, but it is a promise the month is still counting on.
     *
     * The dashboard's overdue feed stops at the start of the current month, deliberately — see
     * `overdue`. This does not, and the difference is not an inconsistency: that feed is a list of
     * things to act on now, while this is a month the owner navigated to on purpose. Its window is
     * the month on screen, so "what was still open in July" stays answerable without any list
     * growing without bound.
     */
    put(occurrence.on, {
      key: keyOf(occurrence),
      title: occurrence.title,
      category: occurrence.category,
      amountCents: occurrence.amountCents,
      direction: occurrence.direction,
      state: occurrence.on <= today ? 'pending' : 'forecast',
      kind: occurrence.kind,
      installment: occurrence.installment,
      time: null,
    });
  }

  const out = new Map<string, CalendarDay>();
  for (let cursor = parseDay(from); cursor <= parseDay(to); cursor = addDays(cursor, 1)) {
    const date = dayKey(cursor);
    const items = (byDate.get(date) ?? []).sort((a, b) => b.amountCents - a.amountCents);
    out.set(date, {
      date,
      items,
      moved: items.reduce((sum, item) => sum + signed(item.amountCents, item.direction), 0),
      pending: items.some((item) => item.state === 'pending'),
    });
  }
  return out;
}

export default function Calendario() {
  return (
    <Screen bottomInset={false}>
      <CalendarioBody />
    </Screen>
  );
}

function CalendarioBody() {
  const { date: requestedDate } = useLocalSearchParams<{ date?: string }>();
  const ready = useLedger((state) => state.ready);
  const error = useLedger((state) => state.error);
  const load = useLedger((state) => state.load);
  const entries = useLedger((state) => state.entries);
  const series = useLedger((state) => state.series);
  const deferrals = useLedger((state) => state.deferralsBySlot);
  const today = useMemo(() => dayKey(new Date()), []);
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    setAnchor(requestedDate);
    setSelected(requestedDate);
  }, [requestedDate]);

  const bounds = useMemo(() => {
    const dates = [...entries.map((entry) => entry.date), ...series.map((item) => item.startDate)];
    const first = dates.sort()[0] ?? today;
    return {
      min: dayKey(startOfMonth(parseDay(first))),
      max: dayKey(startOfMonth(addMonths(parseDay(today), 6))),
    };
  }, [entries, series, today]);

  const month = useMemo(() => {
    const monthStart = startOfMonth(parseDay(anchor));
    const from = dayKey(monthStart);
    const to = dayKey(endOfMonth(monthStart));
    const era: 'past' | 'current' | 'future' = to < today ? 'past' : from > today ? 'future' : 'current';
    const days = calendarDays(entries, series, from, to, today, deferrals);
    const first = startOfWeek(monthStart, { weekStartsOn: 1 });
    const last = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
    const cells: string[] = [];
    for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) cells.push(dayKey(cursor));
    return { from, to, era, days, cells };
  }, [anchor, entries, series, deferrals, today]);

  const selectedDay = month.days.get(selected) ?? null;

  const changeMonth = (next: string) => {
    setAnchor(next);
    const start = dayKey(startOfMonth(parseDay(next)));
    const end = dayKey(endOfMonth(parseDay(next)));
    setSelected(today >= start && today <= end ? today : start);
  };

  return (
    <>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <BackBar />

        <View style={styles.heading}>
          <Txt variant="title" f="sansSemibold">
            Calendário financeiro
          </Txt>
          <Txt variant="body" t="muted" style={styles.intro}>
            O que aconteceu, o que vem e o que ficou pendente.
          </Txt>
        </View>

        {!ready && !error ? (
          <Txt variant="body" t="faint" style={styles.notice}>
            Lendo seu razão.
          </Txt>
        ) : null}

        {error ? (
          <View style={styles.error}>
            <View style={styles.errorRule} />
            <Txt variant="body" t="negative">Não consegui ler seus dados.</Txt>
            <Txt variant="micro" t="faint" style={styles.errorCopy}>{error}</Txt>
          </View>
        ) : null}

        {ready && !error ? (
          <>
            <View style={styles.stepper}>
              <MonthStepper
                anchor={anchor}
                today={today}
                era={month.era}
                min={bounds.min}
                max={bounds.max}
                onChange={changeMonth}
              />
            </View>

            <View style={styles.weekdays} accessibilityElementsHidden>
              {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map((day) => (
                <Txt key={day} variant="micro" t="faint" style={styles.weekday}>{day}</Txt>
              ))}
            </View>

            <View style={styles.grid}>
              {month.cells.map((date) => {
                const inside = date >= month.from && date <= month.to;
                const day = month.days.get(date);
                const current = date === selected;
                const isToday = date === today;
                const tone = day?.pending
                  ? color.warning
                  : (day?.moved ?? 0) < 0
                    ? color.negative
                    : (day?.moved ?? 0) > 0
                      ? color.positive
                      : color.hairline;
                return (
                  <Press
                    key={date}
                    onPress={() => setSelected(date)}
                    disabled={!inside}
                    haptic="light"
                    scale={0.96}
                    dim={0.7}
                    outerStyle={styles.dayHit}
                    style={[styles.day, current ? styles.daySelected : null, !inside ? styles.dayOutside : null]}
                    accessibilityLabel={`${format(parseDay(date), "d 'de' MMMM", { locale: ptBR })}${day?.items.length ? `, ${day.items.length} ${day.items.length === 1 ? 'item' : 'itens'}` : ', sem movimentações'}`}
                    accessibilityState={{ selected: current, disabled: !inside }}
                  >
                    <Txt variant="label" f={isToday || current ? 'monoMedium' : 'mono'} t={inside ? 'ink' : 'faint'} tabular>
                      {format(parseDay(date), 'd')}
                    </Txt>
                    <View style={[styles.dayMark, { backgroundColor: tone, opacity: day?.items.length ? 1 : 0.45 }]} />
                  </Press>
                );
              })}
            </View>

            <View style={styles.legend}>
              <Legend color={color.positive} label="entrou" />
              <Legend color={color.negative} label="saiu" />
              <Legend color={color.warning} label="pendente" />
            </View>

            <View style={styles.detail}>
              <View style={styles.detailRule} />
              <View style={styles.detailHead}>
                <View>
                  <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>DIA SELECIONADO</Txt>
                  <Txt variant="heading" f="sansSemibold" style={styles.detailDate}>
                    {format(parseDay(selected), "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </Txt>
                </View>
                {selectedDay && selectedDay.moved !== 0 ? (
                  <Amount cents={selectedDay.moved} size="body" tone={selectedDay.moved < 0 ? 'negative' : 'positive'} />
                ) : null}
              </View>

              <Animated.View key={selected} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
                {selectedDay?.items.length ? (
                  <View style={styles.items}>
                    {selectedDay.items.map((item) => <DayItemRow key={item.key} item={item} />)}
                  </View>
                ) : (
                  <Txt variant="body" t="faint" style={styles.empty}>
                    Nenhuma movimentação neste dia.
                  </Txt>
                )}
              </Animated.View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function Legend({ color: tint, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendRule, { backgroundColor: tint }]} />
      <Txt variant="micro" t="faint">{label}</Txt>
    </View>
  );
}

function DayItemRow({ item }: { item: CalendarItem }) {
  const state = item.state === 'settled'
    ? 'lançado' + (item.time ? ' · ' + item.time : '')
    : item.state === 'pending'
      ? 'dívida pendente'
      : item.kind === 'debt'
        ? 'dívida prevista'
        : item.kind === 'card'
          ? 'cartão previsto'
          : 'recorrência prevista';
  const detail = item.installment ? `${state} · ${item.installment.n}/${item.installment.of}` : state;
  const tint = item.state === 'pending' ? 'warning' : item.direction === 'out' ? 'negative' : 'positive';

  return (
    <View style={styles.item}>
      <View style={styles.itemCopy}>
        <Txt variant="body" numberOfLines={1}>{item.title}</Txt>
        <Txt variant="micro" t="faint" numberOfLines={1}>{item.category} · {detail}</Txt>
      </View>
      <Amount cents={signed(item.amountCents, item.direction)} size="body" tone={tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.sm, paddingBottom: space.xxl },
  heading: { paddingTop: space.lg },
  intro: { paddingTop: space.xs },
  notice: { paddingTop: space.xl },
  error: { paddingTop: space.xl },
  errorRule: { height: 1, backgroundColor: color.negative, opacity: 0.5, marginBottom: space.md },
  errorCopy: { paddingTop: space.xs },
  stepper: { paddingTop: space.xl },
  weekdays: { flexDirection: 'row', paddingTop: space.lg },
  weekday: { flex: 1, textAlign: 'center', letterSpacing: 0.35 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: space.xs },
  dayHit: { width: '14.2857%' },
  day: { minHeight: 54, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  daySelected: { backgroundColor: color.surface },
  dayOutside: { opacity: 0 },
  dayMark: { width: 16, height: 2, borderRadius: 1, marginTop: space.xs },
  legend: { flexDirection: 'row', gap: space.lg, paddingTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendRule: { width: 12, height: 2, borderRadius: 1 },
  detail: { paddingTop: space.xxl },
  detailRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: space.md },
  sectionLabel: { letterSpacing: 0.8 },
  detailDate: { paddingTop: space.xs, textTransform: 'capitalize' },
  items: { paddingTop: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  itemCopy: { flex: 1, paddingRight: space.lg },
  empty: { paddingTop: space.lg },
});
