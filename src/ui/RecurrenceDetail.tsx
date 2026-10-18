import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { ChipRow } from './Chip';
import { deferChoices } from './choices';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { parseDay } from '@/domain/projection';
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
  following,
  today,
  onDefer,
  canSettle,
  settling,
  onSettle,
  onEdit,
}: {
  series: Series;
  history: DebtHistory;
  open: Occurrence | null;
  /** The occurrence after `open` — said alongside it when `open` is already overdue. */
  following: Occurrence | null;
  today: string;
  /** Absent when the occurrence is not this owner's to move (a linked share). */
  onDefer?: (to: string | null) => Promise<void>;
  canSettle: boolean;
  settling: boolean;
  onSettle: () => void;
  onEdit: () => void;
}) {
  const commitment = useMemo(() => commitmentFor(series, today), [series, today]);
  const debt = series.kind === 'debt' && series.totalCount != null;
  const remaining = commitment.remaining;
  const late = open !== null && open.on < today;

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
              <DetailFact label="por ano" value={brlShort(commitment.yearCents)} mono />
            )}
            {/*
              An occurrence whose day has passed with nothing settling it is said as what it is —
              "vencido" for a bill, "não recebido" for money that should have arrived — in
              `warning`, with the next date beside it. The landing day is `on`, not `date`: a
              deferred occurrence is read where it now falls.
            */}
            {open && late ? (
              <>
                <DetailFact
                  label={series.direction === 'in' ? 'não recebido' : 'vencido'}
                  value={longDate(open.on)}
                  tone="warning"
                />
                <DetailFact label="depois" value={following ? longDate(following.on) : '—'} />
              </>
            ) : (
              <DetailFact
                label="próxima"
                value={
                  open
                    ? open.on !== open.date
                      ? `${longDate(open.on)} · adiada`
                      : longDate(open.on)
                    : '—'
                }
              />
            )}
            {remaining ? (
              <DetailFact
                label="termina"
                value={format(parseDay(remaining.finishes), "MMMM 'de' yyyy", { locale: ptBR })}
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

        {open && onDefer ? (
          <Reveal index={2} {...ENTER} rise={0}>
            <Defer
              open={open}
              today={today}
              noun={debt ? 'esta parcela' : series.direction === 'in' ? 'este recebimento' : 'este vencimento'}
              onDefer={onDefer}
            />
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

const longDate = (d: string) => format(parseDay(d), "d 'de' MMMM", { locale: ptBR });

/**
 * "Adiar", as deliberate steps on the reading rather than a form.
 *
 * A quiet link opens three dated choices; picking one only arms the button, and the button names
 * the exact day before anything is written — "Adiar para 25 de outubro". So the write is always the
 * third, explicit tap, and the day is never a guess. Cancelar folds it away. When the occurrence was
 * already moved, the same place offers putting it back on the rule's own day.
 *
 * The choices come from `deferChoices`, which only offers days the engine will honour (strictly
 * after the occurrence's own day), counted from today when the occurrence is already overdue.
 */
function Defer({
  open,
  today,
  noun,
  onDefer,
}: {
  open: Occurrence;
  today: string;
  noun: string;
  onDefer: (to: string | null) => Promise<void>;
}) {
  const [opened, setOpened] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choices = useMemo(() => deferChoices(open, today), [open, today]);
  const ruleDay = Number(open.date.slice(8));
  const moved = open.on !== open.date;

  // A different occurrence (after a settle or a defer) starts the choice over.
  useEffect(() => {
    setOpened(false);
    setTo(null);
  }, [open.seriesId, open.date, open.on]);

  const run = async (target: string | null) => {
    setBusy(true);
    try {
      await onDefer(target);
    } finally {
      setBusy(false);
    }
  };

  if (!opened) {
    return (
      <View>
        <Press
          onPress={() => setOpened(true)}
          style={styles.deferLink}
          accessibilityLabel={`Adiar ${noun}`}
        >
          <Txt variant="label" t="muted" center>{`Adiar ${noun}`}</Txt>
        </Press>
        {moved ? (
          <Press
            onPress={() => void run(null)}
            disabled={busy}
            style={styles.deferLink}
            accessibilityLabel={`Voltar para o dia ${ruleDay}`}
          >
            <Txt variant="label" t="faint" center>{`Voltar para o dia ${ruleDay}`}</Txt>
          </Press>
        ) : null}
      </View>
    );
  }

  const chosen = choices.find((c) => c.to === to);
  return (
    <View style={styles.defer}>
      <View style={styles.detailRule} />
      <Txt variant="micro" f="sansMedium" t="muted" style={styles.deferLabel}>
        {`ADIAR ${noun.toUpperCase()} PARA`}
      </Txt>
      <ChipRow
        items={choices.map((c) => ({
          key: c.to,
          label: c.label,
          accessibilityLabel: `${longDate(c.to)}, ${c.distance}`,
        }))}
        selected={to}
        onPick={(k) => setTo((prev) => (prev === k ? null : k))}
      />
      <Txt variant="micro" t="faint" style={styles.hint}>
        {chosen
          ? `${chosen.distance.charAt(0).toUpperCase()}${chosen.distance.slice(1)}. A regra continua no dia ${ruleDay}; só este mês muda.`
          : 'Escolha o novo dia. Nada muda até você confirmar.'}
      </Txt>
      <View style={styles.deferAction}>
        <Button
          label={to ? `Adiar para ${longDate(to)}` : 'Escolha um dia'}
          variant="outline"
          onPress={() => {
            if (to) void run(to);
          }}
          disabled={!to || busy}
          loading={busy}
        />
      </View>
      <Press
        onPress={() => {
          setOpened(false);
          setTo(null);
        }}
        style={styles.deferLink}
        accessibilityLabel="Cancelar adiamento"
      >
        <Txt variant="label" t="faint" center>Cancelar</Txt>
      </Press>
    </View>
  );
}

/**
 * One fact. Words and dates written as words are set in sans; mono is for numbers only, so a figure
 * passed as a string asks for it with `mono`.
 */
function DetailFact({
  label,
  value,
  last = false,
  mono = false,
  tone = 'muted',
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
  mono?: boolean;
  tone?: 'muted' | 'warning';
}) {
  return (
    <View style={[styles.detailFact, last ? styles.detailFactLast : null]}>
      <Txt variant="micro" t="faint">{label}</Txt>
      {typeof value === 'string' ? (
        <Txt
          variant="body"
          f={mono ? 'monoMedium' : 'sans'}
          t={tone}
          tabular={mono}
          numberOfLines={1}
          style={styles.detailValue}
        >
          {value}
        </Txt>
      ) : value}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Edge to edge, padded back to the gutter, so the Adiar chips can bleed — see lançar. */
  flex: { flex: 1, marginHorizontal: -space.gutter },
  scroll: { paddingTop: space.md, paddingBottom: space.xxxl, paddingHorizontal: space.gutter },
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
  detailValue: { flexShrink: 1, paddingLeft: space.lg, textAlign: 'right' },
  detailSettle: { paddingTop: space.xl },
  detailEdit: { minHeight: 48, justifyContent: 'center', marginTop: space.lg },
  deferLink: { minHeight: 48, justifyContent: 'center', marginTop: space.sm },
  defer: { paddingTop: space.lg },
  deferLabel: { letterSpacing: 0.8, paddingTop: space.lg, paddingBottom: space.md },
  deferAction: { paddingTop: space.lg },
});
