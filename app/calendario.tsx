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
import { dayKey, parseDay } from '@/domain/projection';
import { calendarDays, type CalendarDay, type CalendarItem } from '@/domain/calendar';
import { withStatements } from '@/domain/card';
import { forecastRoute } from '@/lib/nav';

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
  const accounts = useLedger((state) => state.accounts);
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
    const days = calendarDays(entries, withStatements(accounts, entries, series, today), from, to, today, deferrals);
    const first = startOfWeek(monthStart, { weekStartsOn: 1 });
    const last = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
    const cells: string[] = [];
    for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) cells.push(dayKey(cursor));
    return { from, to, era, days, cells };
  }, [anchor, accounts, entries, series, deferrals, today]);

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
            O que aconteceu, o que vem e o que ficou em atraso.
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
                const marks = day ? dayMarks(day) : [];
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
                    accessibilityLabel={`${format(parseDay(date), "d 'de' MMMM", { locale: ptBR })}${day?.items.length ? `, ${day.items.length} ${day.items.length === 1 ? 'item' : 'itens'}${day.pending ? ', com vencido ou não recebido' : ''}` : ', sem movimentações'}`}
                    accessibilityState={{ selected: current, disabled: !inside }}
                  >
                    <Txt variant="label" f={isToday || current ? 'monoMedium' : 'mono'} t={inside ? 'ink' : 'faint'} tabular>
                      {format(parseDay(date), 'd')}
                    </Txt>
                    {/*
                      One mark per kind of movement, not one per day. A single bar coloured by the
                      day's net hid a salary and a bill landing together behind whichever was
                      larger; and a forecast drawn at full strength claimed "entrou" for money that
                      has not moved. Forecast marks are drawn faint, the way the razão draws a
                      projected balance.
                    */}
                    <View style={styles.marks}>
                      {marks.length === 0 ? (
                        <View style={[styles.dayMark, styles.dayMarkQuiet]} />
                      ) : (
                        marks.map((m) => (
                          <View
                            key={m.kind}
                            style={[styles.mark, { backgroundColor: m.tint, opacity: m.faint ? 0.4 : 1 }]}
                          />
                        ))
                      )}
                    </View>
                  </Press>
                );
              })}
            </View>

            <View style={styles.legend}>
              <Legend color={color.positive} label="entrada" />
              <Legend color={color.negative} label="saída" />
              <Legend color={color.warning} label="vencido ou não recebido" />
              <Legend color={color.inkMuted} label="previsto" faint />
            </View>

            <View style={styles.detail}>
              <View style={styles.detailRule} />
              <View style={styles.detailHead}>
                {/* Shrinks before the figure does, so a long weekday never runs into the total. */}
                <View style={styles.detailTitle}>
                  <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>DIA SELECIONADO</Txt>
                  <Txt variant="heading" f="sansSemibold" numberOfLines={1} style={styles.detailDate}>
                    {sentenceCase(format(parseDay(selected), "EEEE, d 'de' MMMM", { locale: ptBR }))}
                  </Txt>
                </View>
                {selectedDay && selectedDay.moved !== 0 ? (
                  <Amount
                    cents={selectedDay.moved}
                    direction={selectedDay.moved < 0 ? 'out' : 'in'}
                    size="body"
                    tone={selectedDay.moved < 0 ? 'negative' : 'positive'}
                  />
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

/**
 * "Segunda-feira, 5 de outubro", not "Segunda-Feira, 5 De Outubro". `textTransform: capitalize`
 * titlecased every word, which is English headline style; Portuguese capitalises the sentence.
 */
function sentenceCase(s: string): string {
  return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
}

/** The marks under a day: one per kind present, in a fixed order so a day never reshuffles. */
function dayMarks(day: CalendarDay): { kind: string; tint: string; faint: boolean }[] {
  const out: { kind: string; tint: string; faint: boolean }[] = [];
  for (const [kind, tint] of [
    ['in', color.positive],
    ['out', color.negative],
  ] as const) {
    const rows = day.items.filter((i) => i.direction === kind && i.state !== 'pending');
    // Faint only when every row of this kind is still a forecast; one recorded row makes it fact.
    if (rows.length) out.push({ kind, tint, faint: rows.every((i) => i.state === 'forecast') });
  }
  if (day.pending) out.push({ kind: 'late', tint: color.warning, faint: false });
  return out;
}

function Legend({ color: tint, label, faint }: { color: string; label: string; faint?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendRule, { backgroundColor: tint, opacity: faint ? 0.4 : 1 }]} />
      <Txt variant="micro" t="faint">{label}</Txt>
    </View>
  );
}

/**
 * One row of the day, and the way into it — a recorded row opens the lançamento, a forecast or a
 * late one opens the rule that produced it, the same doors the Home's rows use. A row with neither
 * stays a readout rather than a control that does nothing.
 */
function DayItemRow({ item }: { item: CalendarItem }) {
  // Late is named by direction, as everywhere else: a bill is "vencido", money that did not arrive
  // is "não recebido". "Dívida pendente" called an unpaid rent a debt.
  const state = item.state === 'settled'
    ? 'lançado' + (item.time ? ' · ' + item.time : '')
    : item.state === 'pending'
      ? item.direction === 'in'
        ? 'não recebido'
        : 'vencido'
      : item.kind === 'debt'
        ? 'dívida prevista'
        : item.kind === 'card'
          ? 'fatura prevista'
          : 'recorrência prevista';
  const detail = item.installment ? `${state} · parcela ${item.installment.n}/${item.installment.of}` : state;
  const tint = item.state === 'pending' ? 'warning' : item.direction === 'out' ? 'negative' : 'positive';
  const to =
    item.state === 'settled' && item.entryId
      ? ({ pathname: '/lancar', params: { id: item.entryId } } as const)
      : item.state !== 'settled' && item.seriesId && item.scheduled
        ? forecastRoute(item.seriesId, item.scheduled)
        : null;

  const body = (
    <View style={styles.item}>
      <View style={styles.itemCopy}>
        <Txt variant="body" t={item.state === 'settled' ? 'ink' : 'muted'} numberOfLines={1}>{item.title}</Txt>
        <Txt variant="micro" t={item.state === 'pending' ? 'warning' : 'faint'} numberOfLines={1}>
          {item.category} · {detail}
        </Txt>
      </View>
      <Amount cents={item.amountCents} direction={item.direction} size="body" tone={tint} />
    </View>
  );

  if (!to) return body;
  return (
    <Press onPress={() => router.push(to)} accessibilityLabel={`Abrir ${item.title}`}>
      {body}
    </Press>
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
  marks: { flexDirection: 'row', gap: 2, marginTop: space.xs, height: 2 },
  mark: { width: 6, height: 2, borderRadius: 1 },
  dayMark: { width: 16, height: 2, borderRadius: 1 },
  dayMarkQuiet: { backgroundColor: color.hairline, opacity: 0.45 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs, paddingTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendRule: { width: 12, height: 2, borderRadius: 1 },
  detail: { paddingTop: space.xxl },
  detailRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: space.md },
  sectionLabel: { letterSpacing: 0.8 },
  detailTitle: { flexShrink: 1, paddingRight: space.lg },
  detailDate: { paddingTop: space.xs },
  items: { paddingTop: space.sm },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  itemCopy: { flex: 1, paddingRight: space.lg },
  empty: { paddingTop: space.lg },
});
