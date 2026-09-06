import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BackBar } from './BackBar';
import { Reveal } from './Reveal';
import { Press } from './Press';
import { Button } from './Button';
import { Amount } from './Amount';
import { DebtSharePanel } from './DebtSharePanel';
import { PaymentHistory } from './PaymentHistory';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { dayKey, parseDay } from '@/domain/projection';
import { commitmentFor } from '@/domain/commitments';
import { brlShort } from '@/domain/money';
import type { DebtHistory } from '@/domain/settlement';
import type { Occurrence, Series } from '@/domain/model';

const ENTER = { delay: 160, step: 70, cap: 6, rise: 10, shift: 26 } as const;

/**
 * A recurrence at rest.
 *
 * **The authored idea: opening something is not the same as changing it.** This screen used to hand
 * over the whole form the moment a rule was tapped — eleven controls, a category strip and a delete
 * button — to answer questions that are almost never about editing. "Quantas faltam." "Ele pagou?"
 * Those are readings, and a form is the wrong shape for a reading: every field is a control that
 * asks to be operated, so a screen made entirely of them says *change me* when the owner only meant
 * *show me*.
 *
 * So the tap lands here, and editing is one deliberate step further in. The form still exists,
 * unchanged, behind a button that names what it does.
 *
 * **The shape deliberately echoes the shared link.** A debt read here is laid out the way
 * `divida/[token]` lays it out — the figure that is still open, then the ticks, then the facts,
 * then the history. The owner is looking at what the other person is looking at, and that is worth
 * more than a bespoke layout: it means the answer to "o que o Gabriel está vendo?" is *this*, and
 * nobody has to send a link to themselves to find out.
 */
export function RecurrenceDetail({
  series,
  history,
  open,
  canSettle,
  settling,
  onSettle,
  onEdit,
}: {
  series: Series;
  history: DebtHistory;
  open: Occurrence | null;
  canSettle: boolean;
  settling: boolean;
  onSettle: () => void;
  onEdit: () => void;
}) {
  const today = useMemo(() => dayKey(new Date()), []);
  const commitment = useMemo(() => commitmentFor(series, today), [series, today]);
  const debt = series.kind === 'debt' && series.totalCount != null;
  const remaining = commitment.remaining;

  return (
    <>
      <BackBar />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Reveal index={0} {...ENTER}>
          <Txt variant="body" t="muted">
            {debt
              ? series.direction === 'out'
                ? `você deve a ${series.counterparty ?? 'alguém'}`
                : `${series.counterparty ?? 'alguém'} deve a você`
              : series.direction === 'in'
                ? 'entra todo mês'
                : 'sai todo mês'}
          </Txt>
          <Txt variant="title" f="sansSemibold" style={styles.detailTitle}>
            {series.title}
          </Txt>

          {/*
            One figure, chosen by what the thing is. A debt's headline is what is still owed — the
            number that shrinks, and the only one anybody opens a debt to see. A subscription has no
            such number, so it leads with what it costs to keep.
          */}
          <Amount cents={remaining ? remaining.cents : series.amountCents} size="hero" tone="ink" />
          <Txt variant="label" t="muted" style={styles.detailUnder}>
            {remaining
              ? `faltam ${remaining.count} de ${series.totalCount}`
              : series.direction === 'in'
                ? 'por mês'
                : 'por mês'}
          </Txt>
        </Reveal>

        <Reveal index={1} {...ENTER}>
          <View style={styles.detailRule} />
          <View style={styles.detailFacts}>
            {debt ? (
              <DetailFact label="cada parcela" value={<Amount cents={series.amountCents} size="body" tone="muted" />} />
            ) : (
              <DetailFact label="por ano" value={brlShort(commitment.yearCents)} />
            )}
            <DetailFact
              label="próxima"
              value={open ? format(parseDay(open.date), "d 'de' MMMM", { locale: ptBR }) : '—'}
            />
            {remaining ? (
              <DetailFact
                label="termina"
                value={format(parseDay(remaining.finishes), "MMM 'de' yyyy", { locale: ptBR })}
                last
              />
            ) : (
              <DetailFact label="categoria" value={series.category} last />
            )}
          </View>
        </Reveal>

        {canSettle && open ? (
          <Reveal index={2} {...ENTER} rise={0}>
            <View style={styles.detailSettle}>
              <Button
                label={(series.direction === 'in' ? 'Recebi' : 'Paguei') + ' — lançar hoje'}
                onPress={onSettle}
                disabled={settling}
                loading={settling}
              />
            </View>
          </Reveal>
        ) : null}

        {debt ? (
          <Reveal index={3} {...ENTER} rise={0}>
            <PaymentHistory {...history} total={series.totalCount ?? 0} />
          </Reveal>
        ) : null}

        {series.linkedShareToken ? (
          <View style={styles.linkedNotice}>
            <View style={styles.consequenceRule} />
            <Txt variant="body" t="ink">Acompanhamento conectado a {series.counterparty}.</Txt>
            <Txt variant="micro" t="faint" style={styles.hint}>
              O progresso vem da dívida original. Só quem compartilhou confirma as parcelas.
            </Txt>
          </View>
        ) : null}

        {/*
          Editing is a quiet link rather than a filled button. The loud position on this screen
          belongs to lançar a parcela — the thing that is actually done here, repeatedly — and
          giving it to `Editar` would put the rarest action in the most reachable place.
        */}
        <Press onPress={onEdit} style={styles.detailEdit} accessibilityLabel="Editar recorrência">
          <Txt variant="label" t="muted" center>Editar</Txt>
        </Press>

        {series.kind === 'debt' && !series.linkedShareToken ? (
          <DebtSharePanel series={series} />
        ) : null}
      </ScrollView>
    </>
  );
}

function DetailFact({
  label,
  value,
  last = false,
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailFact, last ? styles.detailFactLast : null]}>
      <Txt variant="micro" t="faint">{label}</Txt>
      {typeof value === 'string' ? (
        <Txt variant="body" f="monoMedium" t="muted" tabular>{value}</Txt>
      ) : value}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.md, paddingBottom: space.xxxl },
  hint: { paddingTop: space.sm },
  linkedNotice: { paddingTop: space.xl },
  consequenceRule: {
    height: 1,
    backgroundColor: color.hairlineStrong,
    marginBottom: space.md,
  },

  detailTitle: { paddingTop: space.sm, paddingBottom: space.xl },
  detailUnder: { paddingTop: space.xs },
  detailRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.hairlineStrong,
    marginTop: space.xxl,
  },
  detailFacts: { paddingTop: space.sm },
  detailFact: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  detailFactLast: { borderBottomWidth: 0 },
  detailSettle: { paddingTop: space.xl },
  detailEdit: { minHeight: 48, justifyContent: 'center', marginTop: space.lg },
});
