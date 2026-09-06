import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Amount } from '@/ui/Amount';
import { DebtLadder } from '@/ui/chart/DebtLadder';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useLedger } from '@/state/ledger';
import { dayKey, parseDay } from '@/domain/projection';
import { commitments, type Commitment } from '@/domain/commitments';
import { brlShort } from '@/domain/money';

/* Pushed laterally, so the perceived duration comes from the content, not the native slide. */
const ENTER = { delay: 160, step: 70, cap: 5, rise: 10, shift: 26 } as const;

/**
 * The rules, not the facts.
 *
 * Every other screen in OTTO is the ledger — things that happened, or things the engine says will.
 * This is the other side: the recurrences that *produce* them. The score, not the music.
 *
 * **The authored idea: a rule costs something over its life, and nobody ever adds it up.** Spotify is
 * not R$ 21,90; it is R$ 262,80 a year. That second figure is the one that gets a subscription
 * cancelled, and it is the only thing this screen can say that no other screen in the app can. So
 * every recurrence here carries it, computed by running the same projection engine the rest of the
 * app runs — which is why a subscription that ends in March costs what it costs until March.
 *
 * For a debt the number inverts. Not what it costs to keep, but what is left and when it stops —
 * counted in installments, never rounded into a percentage, because how many are left is the only
 * fact the owner can act on.
 *
 * And above all of it, the figure that is the reason to look: **what the month has left before the
 * owner spends anything at all.**
 */
export default function Recorrencias() {
  return (
    <Screen>
      <RecorrenciasBody />
    </Screen>
  );
}

function RecorrenciasBody() {
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

  return (
    <>
      <BackBar />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <Reveal index={0} {...ENTER}>
            <Txt variant="heading" f="sansSemibold" style={styles.head}>
              Não consegui ler seus dados.
            </Txt>
            <Txt variant="body" t="muted" style={styles.notice}>
              {error}
            </Txt>
          </Reveal>
        ) : null}

        {view ? (
          <>
            <Reveal index={0} {...ENTER}>
              <View style={styles.hero}>
                <Amount
                  cents={view.free}
                  size="hero"
                  tone={view.free < 0 ? 'negative' : 'ink'}
                />
                <Txt variant="label" t="muted" style={styles.heroLabel}>
                  livre por mês, antes de você gastar
                </Txt>
                <Txt variant="micro" t="faint" style={styles.heroNote}>
                  {brlShort(view.monthlyIn)} entram, {brlShort(view.monthlyOut)} já estão prometidos
                </Txt>
              </View>
            </Reveal>

            <Reveal index={1} {...ENTER} rise={0}>
              <Press
                onPress={() => router.push('/recorrencia')}
                style={styles.add}
                accessibilityLabel="Nova recorrência"
              >
                <Txt variant="body" t="ink">
                  + Nova recorrência
                </Txt>
              </Press>
            </Reveal>

            <Group label="sai todo mês" items={view.out} index={2} />
            <Group label="entra todo mês" items={view.in} index={3} />

            {view.debts.length > 0 ? (
              <View>
                <Section
                  label="você deve"
                  aside={brlShort(view.debts.reduce((n, d) => n + (d.remaining?.cents ?? 0), 0))}
                />
                {view.debts.map((d, i) => (
                  <Press
                    key={d.series.id}
                    onPress={() => openDebt(d.series.id, d.series.linkedShareToken)}
                    style={styles.debt}
                    accessibilityLabel={d.series.title}
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
                      delay={420}
                    />
                  </Press>
                ))}
              </View>
            ) : null}

            {view.receivables.length > 0 ? (
              <View>
                <Section
                  label="você recebe"
                  aside={brlShort(view.receivables.reduce((n, d) => n + (d.remaining?.cents ?? 0), 0))}
                />
                {view.receivables.map((d, i) => (
                  <Press
                    key={d.series.id}
                    onPress={() => openDebt(d.series.id, d.series.linkedShareToken)}
                    style={styles.debt}
                    accessibilityLabel={`${d.series.title}, a receber de ${d.series.counterparty ?? 'outra pessoa'}`}
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
                      delay={500}
                    />
                  </Press>
                ))}
              </View>
            ) : null}

            {view.out.length === 0 && view.in.length === 0 && view.debts.length === 0 && view.receivables.length === 0 ? (
              <Txt variant="body" t="faint" style={styles.notice}>
                Nenhuma recorrência ainda. Cadastre o que se repete todo mês — aluguel, salário,
                assinaturas — e o OTTO passa a projetar o seu mês inteiro.
              </Txt>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function openDebt(id: string, token: string | null) {
  if (token) router.push({ pathname: '/divida/[token]' as never, params: { token } });
  else router.push({ pathname: '/recorrencia', params: { id } });
}

function Group({
  label,
  items,
  index,
}: {
  label: string;
  items: Commitment[];
  index: number;
}) {
  if (items.length === 0) return null;
  const monthly = items.reduce((n, c) => n + c.monthlyCents, 0);

  return (
    <Reveal index={index} {...ENTER} rise={0}>
      <Section label={label} aside={brlShort(monthly) + ' /mês'} />
      {items.map((c) => (
        <Press
          key={c.series.id}
          onPress={() => router.push({ pathname: '/recorrencia', params: { id: c.series.id } })}
          style={styles.row}
          accessibilityLabel={c.series.title}
        >
          <View style={styles.rowText}>
            <Txt variant="body" numberOfLines={1}>
              {c.series.title}
            </Txt>
            {/*
              The figure this screen exists for. Set beside the ordinary monthly amount rather than
              instead of it: the reader knows the monthly number already, and it is the second one
              that changes a mind.
            */}
            <Txt variant="micro" t="faint" numberOfLines={1}>
              dia {c.series.dayOfMonth} · {c.series.category} ·{' '}
              <Txt variant="micro" f="monoMedium" t="muted">
                {brlShort(c.yearCents)} por ano
              </Txt>
              {ends(c) ? ` · acaba em ${ends(c)}` : ''}
            </Txt>
          </View>
          <Amount
            cents={c.series.direction === 'out' ? -c.monthlyCents : c.monthlyCents}
            size="body"
            tone={c.series.direction === 'out' ? 'ink' : 'positive'}
          />
        </Press>
      ))}
    </Reveal>
  );
}

/**
 * When a series that does not fill the year runs out.
 *
 * Only an end date can shorten a non-debt series — an installment count is what shortens a debt, and
 * debts are drawn in their own group and never reach here. So this reads `endDate` and does not
 * invent a fallback: a fallback here would be unreachable code carrying a plausible wrong answer,
 * which is worse than no code at all.
 */
function ends(c: Commitment): string | null {
  if (!c.series.endDate) return null;
  return format(parseDay(c.series.endDate), "MMM 'de' yyyy", { locale: ptBR });
}

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
  scroll: { paddingTop: space.md, paddingBottom: space.xxxl },
  head: { paddingTop: space.xl },
  notice: { paddingTop: space.lg },

  hero: { paddingTop: space.lg },
  heroLabel: { paddingTop: space.xs },
  heroNote: { paddingTop: space.xs },

  add: { paddingTop: space.xl, paddingBottom: space.xs },

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
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, paddingRight: space.lg },

  debt: { paddingVertical: 0 },
});
