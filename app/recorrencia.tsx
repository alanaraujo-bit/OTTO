import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { addDays, addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { DebtSharePanel } from '@/ui/DebtSharePanel';
import { RecurrenceDetail } from '@/ui/RecurrenceDetail';
import { Field } from '@/ui/Field';
import { MoneyField } from '@/ui/MoneyField';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { ChipRow } from '@/ui/Chip';
import { categoryOrderFor } from '@/ui/choices';
import { Txt } from '@/theme/text';
import { color, radius, space } from '@/theme/tokens';
import { saidPlainly } from '@/lib/errors';
import { useSnackbar } from '@/ui/Snackbar';
import { useLedger } from '@/state/ledger';
import { deferOccurrence, deleteSeries, insertSeries, updateSeries } from '@/db/repo';
import { dayKey, nextOpen, parseDay, project } from '@/domain/projection';
import { settled } from '@/domain/settlement';
import { monthOf } from '@/domain/deferral';
import { commitmentFor } from '@/domain/commitments';
import { debtHistory } from '@/domain/settlement';
import { brlShort } from '@/domain/money';
import type { Series, SeriesKind } from '@/domain/model';

const ENTER = { delay: 160, step: 70, cap: 6, rise: 10, shift: 26 } as const;


/**
 * One rule, written down.
 *
 * The shape the owner picks is the `kind` field of the unified series model, put in front of them as
 * the only three questions that actually differ: does money come in or go out, and does it stop.
 * Everything else — the amount, the day, the category — is the same for all of them, which is the
 * whole reason `series` is one table and not four.
 *
 * **The yearly cost is shown while it is being typed**, not after saving. It is the figure the
 * recurrences screen is built around, and seeing R$ 262,80 appear as you enter R$ 21,90 is the
 * moment it does its work.
 */
export default function Recorrencia() {
  return (
    <Screen>
      <Form />
    </Screen>
  );
}

/** The three shapes a recurrence can take, in the owner's terms rather than the schema's. */
type Shape = 'out' | 'in' | 'debt';

/*
 * Named by what the thing *is*, not half by direction and half by shape. "SAI / ENTRA / TERMINA"
 * answered two different questions in one row (REC-05) — and a debt can come in as easily as go
 * out, which is what "De que lado está" below already asks.
 */
const SHAPES: { key: Shape; label: string; note: string }[] = [
  { key: 'out', label: 'SAÍDA FIXA', note: 'conta ou assinatura, todo mês, sem data para acabar' },
  { key: 'in', label: 'ENTRADA FIXA', note: 'salário ou outra renda, todo mês' },
  { key: 'debt', label: 'PARCELADA', note: 'dívida ou parcelamento, com número de parcelas' },
];

function Form() {
  const snack = useSnackbar();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const series = useLedger((s) => s.series);
  const accounts = useLedger((s) => s.accounts);
  const entries = useLedger((s) => s.entries);
  const load = useLedger((s) => s.load);
  const storedCategories = useLedger((s) => s.categories);
  const deferrals = useLedger((s) => s.deferralsBySlot);

  const existing = useMemo(() => series.find((s) => s.id === id) ?? null, [series, id]);

  // Read off the entries, so it stays true to what was actually recorded rather than to the
  // `parcelas ja pagas` number sitting in the form above it.
  const history = useMemo(
    () => (existing ? debtHistory(existing, entries) : { payments: [], untracked: 0 }),
    [existing, entries],
  );

  const [shape, setShape] = useState<Shape>('out');
  const [debtDirection, setDebtDirection] = useState<'out' | 'in'>('out');
  const [title, setTitle] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [category, setCategory] = useState('Outros');
  const [amount, setAmount] = useState<number | null>(null);
  const [day, setDay] = useState('');
  const [total, setTotal] = useState('');
  const [paid, setPaid] = useState('');
  const [saving, setSaving] = useState(false);
  const [armed, setArmed] = useState(false);

  // The same vocabulary the lançamento screen offers, in the same order and listening to the same
  // direction. Two lists that diverge teach the owner to distrust both.
  const direction = shape === 'debt' ? debtDirection : shape === 'in' ? 'in' : 'out';
  const categories = useMemo(
    () => categoryOrderFor(direction, entries, series, storedCategories),
    [direction, entries, series, storedCategories],
  );
  // A rule that already exists opens as a reading. Creating one has nothing to read, so the form is
  // the only sensible landing and this starts true there.
  const [editing, setEditing] = useState(false);

  /*
   * What this rule still owes, and where an antecipação would land.
   *
   * `nextOpen` answers the first, and it is the whole reason the settlement is addressed by the
   * occurrence rather than by the calendar: the button has to name the day it is retiring, and after
   * it fires that day is gone from the projection while the rule itself is untouched.
   */
  const today = useMemo(() => dayKey(new Date()), []);
  const open = useMemo(
    () => (existing ? nextOpen(existing, entries, today, deferrals) : null),
    [existing, entries, deferrals, today],
  );
  /*
   * What comes after the open occurrence. Read when that one is overdue: the reading then has two
   * dates to say — the one that was missed and the one the rule moves on to. "Próxima: 8 de
   * outubro" on a rent ten days late was the screen calling the past the future (REC-01).
   */
  const following = useMemo(() => {
    if (!existing || !open) return null;
    const t = parseDay(today);
    const to = dayKey(endOfMonth(addMonths(t, 13)));
    return (
      project([existing], dayKey(addDays(t, 1)), to, settled(entries), deferrals).find(
        (o) => o.date !== open.date,
      ) ?? null
    );
  }, [existing, open, entries, deferrals, today]);

  /*
   * Adiar: move the open occurrence to a later day, or put it back.
   *
   * Through `deferOccurrence`, keyed by the occurrence's own month, so the rule is untouched and the
   * installment keeps its number wherever it lands — see `domain/deferral`. The detail screen owns
   * the choosing and the confirming; this only writes what it was told.
   */
  const defer = async (to: string | null) => {
    if (!existing || !open) return;
    try {
      await deferOccurrence(existing.id, monthOf(open.date), to);
      await load();
      snack(
        to
          ? `Adiado para ${format(parseDay(to), "d 'de' MMMM", { locale: ptBR })}.`
          : `De volta ao dia ${Number(open.date.slice(8))}.`,
        'info',
      );
    } catch (e) {
      snack(saidPlainly(e), 'error');
    }
  };

  /*
   * Where the settlement lands: the account the rule already names.
   *
   * The fallback is only for a rule booked against a card, where the money cannot arrive — a credit
   * line is not money, which is the same reason `balanceToday` skips one. Anything else would book
   * the salary to whichever conta happened to sort first, and the balance would be right while
   * every per-account figure was wrong.
   */
  const settleAccount = useMemo(() => {
    if (!existing) return null;
    const own = accounts.find((a) => a.id === existing.accountId);
    if (own && own.kind !== 'card') return own.id;
    return accounts.find((a) => a.kind !== 'card')?.id ?? null;
  }, [accounts, existing]);

  /*
   * Settling goes through the keypad, not straight to the ledger.
   *
   * A rule is a statement of what is expected; what arrived is a different fact. They agree most
   * months and that is exactly what made writing `existing.amountCents` here look correct — until
   * the bônus comes in under, the conta comes in over, and the owner has recorded a number they
   * never received with no moment at which they could have said so. `lançar` already knows how to
   * settle an occurrence at a figure the owner types, so this hands the occurrence over instead of
   * keeping a second, blinder copy of the same write.
   */
  const settleNow = () => {
    if (!existing || !open || !settleAccount) return;
    router.push({
      pathname: '/lancar',
      params: { settlesSeries: existing.id, settlesDate: open.date },
    });
  };

  // A destructive action that arms itself must be able to stand down, or the next stray tap on the
  // row does the thing. Same rule as the reseed in ajustes.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  // The ledger arrives after the first render, so the form is filled in an effect rather than in
  // initial state — otherwise opening an existing recurrence would show a blank form for a frame.
  useEffect(() => {
    if (!existing) return;
    setShape(existing.kind === 'debt' ? 'debt' : existing.direction === 'in' ? 'in' : 'out');
    setDebtDirection(existing.direction);
    setTitle(existing.title);
    setCounterparty(existing.counterparty ?? '');
    setCategory(existing.category);
    // Cents in, cents out — a whole-reais round trip here used to silently round R$21,90 up to
    // R$22,00 the moment the recurrence was reopened for any other edit.
    setAmount(existing.amountCents);
    setDay(String(existing.dayOfMonth));
    setTotal(existing.totalCount == null ? '' : String(existing.totalCount));
    setPaid(String(existing.paidCount));
  }, [existing]);

  const cents = amount ?? 0;
  const dayOfMonth = num(day, 1, 31);
  const totalCount = num(total, 1, 480);
  const paidCount = num(paid, 0, totalCount ?? 480) ?? 0;

  const account = existing?.accountId ?? accounts.find((a) => a.kind !== 'card')?.id ?? '';

  // The ledger arrives after the first render, so an account is something the form waits for rather
  // than something it assumes. Without this the button is live before there is anywhere to book to,
  // and the owner taps it only to be told 'nenhuma conta encontrada' with nothing explaining why.
  const valid =
    account !== '' &&
    title.trim() !== '' &&
    cents > 0 &&
    dayOfMonth !== null &&
    (shape !== 'debt' || (totalCount !== null && paidCount <= totalCount));

  /** The draft as the engine would see it, so the yearly figure is the real one and not an estimate. */
  const preview = useMemo(() => {
    if (!valid || dayOfMonth === null) return null;
    const today = dayKey(new Date());
    const draft: Series = {
      id: existing?.id ?? 'draft',
      kind: kindOf(shape, existing),
      title: title.trim(),
      category,
      accountId: account,
      amountCents: cents,
      direction: shape === 'debt' ? debtDirection : shape === 'in' ? 'in' : 'out',
      dayOfMonth,
      /*
       * The start is written once and never rewritten.
       *
       * It used to be derived from `paidCount` on every save, on the argument that the two were
       * "two spellings of one fact". They are not, and the difference surfaces the moment an
       * installment is skipped or deferred: `paidCount` counts how many are done, while the start
       * anchors *which month is which installment*. Recomputing it slid the anchor forward every
       * time the owner corrected an unrelated field, and since installment numbers are read off the
       * calendar, a slid anchor renumbers payments that already happened — the exact renumbering
       * this feature must never do.
       *
       * So a debt derives its start only when it is created, from the installments declared paid.
       * After that the anchor is a fact about the debt, not a view of its progress.
       */
      startDate:
        shape === 'debt' && existing == null
          ? startDateFor(shape, paidCount, today)
          : (existing?.startDate ?? today),
      endDate: existing?.endDate ?? null,
      totalCount: shape === 'debt' ? totalCount : null,
      paidCount: shape === 'debt' ? paidCount : 0,
      /*
       * Empty means null, not ''.
       *
       * Naming the other side is optional — a parcelamento no cartão is a debt with nobody on the
       * far end. But every reader of this field spells its absence `?? 'alguém'`, and nullish
       * coalescing does not catch the empty string: storing '' would render "você deve a " with the
       * sentence hanging open.
       */
      counterparty: shape === 'debt' ? counterparty.trim() || null : null,
      linkedShareToken: existing?.linkedShareToken ?? null,
    };
    return { draft, commitment: commitmentFor(draft, today) };
  }, [valid, shape, debtDirection, title, counterparty, category, cents, dayOfMonth, totalCount, paidCount, existing, account]);

  const save = async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      const next: Series = { ...preview.draft, id: existing?.id ?? Crypto.randomUUID() };
      if (existing) await updateSeries(next);
      else await insertSeries(next);
      await load();
      router.back();
    } catch (e) {
      setSaving(false);
      snack(saidPlainly(e), 'error');
    }
  };

  /*
   * Reading, unless the owner asked to change something.
   *
   * Placed after every hook above, so the two modes never take different hook paths. A new
   * recurrence has no `existing` and therefore lands straight in the form, which is right: there is
   * nothing to read yet.
   */
  if (existing && !editing) {
    return (
      <RecurrenceDetail
        series={existing}
        history={history}
        open={open}
        following={following}
        today={today}
        onDefer={existing.linkedShareToken ? undefined : defer}
        canSettle={Boolean(settleAccount) && !existing.linkedShareToken}
        settling={false}
        onSettle={settleNow}
        onEdit={() => setEditing(true)}
      />
    );
  }

  return (
    <>
      <BackBar />

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Reveal index={0} {...ENTER} rise={0}>
          <View style={styles.shapes}>
            {SHAPES.map((s) => (
              <Press
                key={s.key}
                onPress={() => setShape(s.key)}
                outerStyle={styles.shapeHit}
                style={styles.shape}
                accessibilityLabel={s.label}
                accessibilityState={{ selected: shape === s.key }}
              >
                <Txt
                  variant="label"
                  f="sansMedium"
                  t={shape === s.key ? 'ink' : 'faint'}
                  center
                >
                  {s.label}
                </Txt>
                <View
                  style={[styles.shapeRule, shape === s.key ? styles.shapeRuleOn : null]}
                />
              </Press>
            ))}
          </View>
          <Txt variant="micro" t="faint" style={styles.shapeNote}>
            {SHAPES.find((s) => s.key === shape)?.note}
          </Txt>
        </Reveal>

        {shape === 'debt' ? (
          <Reveal index={1} {...ENTER} rise={0}>
            <Txt variant="micro" f="sansMedium" t="muted" style={styles.groupLabel}>
              DE QUE LADO ESTÁ
            </Txt>
            <View style={styles.debtSides}>
              {([
                { key: 'out' as const, label: 'EU DEVO' },
                { key: 'in' as const, label: 'ME DEVEM' },
              ]).map((option) => (
                <Press
                  key={option.key}
                  onPress={() => setDebtDirection(option.key)}
                  outerStyle={styles.debtSideHit}
                  style={[styles.debtSide, debtDirection === option.key ? styles.debtSideOn : null]}
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: debtDirection === option.key }}
                >
                  <Txt
                    variant="label"
                    f="sansMedium"
                    t={debtDirection === option.key ? 'onInk' : 'muted'}
                    center
                  >
                    {option.label}
                  </Txt>
                </Press>
              ))}
            </View>
          </Reveal>
        ) : null}

        <Reveal index={1} {...ENTER}>
          <Field
            label="Nome"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            maxLength={60}
          />
        </Reveal>

        {shape === 'debt' ? (
          <Reveal index={2} {...ENTER}>
            <Field
              label={
                debtDirection === 'out'
                  ? 'Para quem você deve (opcional)'
                  : 'Quem deve para você (opcional)'
              }
              value={counterparty}
              onChangeText={setCounterparty}
              autoCapitalize="words"
              maxLength={80}
              placeholder="Nome da pessoa"
            />
          </Reveal>
        ) : null}

        <View style={styles.gap} />
        <Reveal index={2} {...ENTER}>
          {/* A rent has no parcelas; only a debt does (REC-02). */}
          <MoneyField
            label={shape === 'debt' ? 'Valor da parcela' : 'Valor por mês'}
            cents={amount}
            onChangeCents={setAmount}
          />
        </Reveal>

        <View style={styles.gap} />
        <Reveal index={3} {...ENTER}>
          <Field
            label="Dia do mês"
            numeric
            value={day}
            onChangeText={(t) => setDay(t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            error={day !== '' && dayOfMonth === null ? 'Um dia entre 1 e 31.' : null}
          />
          <Txt variant="micro" t="faint" style={styles.hint}>
            Dia 31 cai no último dia dos meses que não têm um.
          </Txt>
        </Reveal>

        {shape === 'debt' ? (
          <>
            <View style={styles.gap} />
            <Reveal index={4} {...ENTER}>
              <Field
                label="Total de parcelas"
                numeric
                value={total}
                onChangeText={(t) => setTotal(t.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad"
              />
              <View style={styles.gap} />
              <Field
                label="Parcelas já pagas"
                numeric
                value={paid}
                onChangeText={(t) => setPaid(t.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad"
                error={
                  totalCount !== null && paidCount > totalCount
                    ? 'Não dá para ter pago mais parcelas do que existem.'
                    : null
                }
              />
            </Reveal>
          </>
        ) : null}

        <Reveal index={5} {...ENTER} rise={0}>
          <Txt variant="micro" f="sansMedium" t="muted" style={styles.groupLabel}>
            CATEGORIA
          </Txt>
          <ChipRow
            // A category the list does not hold (renamed elsewhere since) is still the rule's own,
            // so it stays offered — selected — rather than silently swapping to another on Salvar.
            items={(categories.includes(category) ? categories : [category, ...categories]).map(
              (c) => ({ key: c, label: c }),
            )}
            selected={category}
            onPick={setCategory}
          />
        </Reveal>

        {/*
          The consequence, while it is being typed. This is the figure the recurrences screen is
          built around, and watching R$ 262,80 appear as you type R$ 21,90 is the moment it works.
        */}
        {preview ? (
          <View style={styles.consequence}>
            <View style={styles.consequenceRule} />
            {/* Figures in mono, the sentence around them in sans — one sentence, two families. */}
            {shape === 'debt' && preview.commitment.remaining ? (
              <Txt variant="body" t="ink">
                {'Faltam '}
                <Txt variant="body" f="mono" tabular>
                  {`${preview.commitment.remaining.count} de ${totalCount}`}
                </Txt>
                {': '}
                <Txt variant="body" f="mono" tabular>
                  {brlShort(preview.commitment.remaining.cents)}
                </Txt>
                {`, terminando em ${format(parseDay(preview.commitment.remaining.finishes), "MMMM 'de' yyyy", { locale: ptBR })}.`}
              </Txt>
            ) : (
              <Txt variant="body" t="ink">
                <Txt variant="body" f="mono" tabular>
                  {brlShort(preview.commitment.yearCents)}
                </Txt>
                {' por ano.'}
              </Txt>
            )}
          </View>
        ) : null}

        <View style={styles.gap} />
        <Button
          label={existing ? 'Salvar' : 'Criar recorrência'}
          onPress={() => void save()}
          disabled={!valid || saving}
          loading={saving}
        />

        {/* A way back out that is not the system gesture, and that does not discard by looking
            like the primary action. Only in edit mode: creating already has BackBar. */}
        {existing ? (
          <Press
            onPress={() => setEditing(false)}
            style={styles.detailEdit}
            accessibilityLabel="Cancelar edição"
          >
            <Txt variant="label" t="muted" center>Cancelar</Txt>
          </Press>
        ) : null}

        {existing ? (
          <Press
            onPress={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              setArmed(false);
              void deleteSeries(existing.id)
                .then(load)
                .then(() => router.back());
            }}
            style={styles.remove}
            accessibilityLabel={armed ? 'Toque de novo para excluir' : 'Excluir recorrência'}
          >
            <Txt variant="label" t={armed ? 'negative' : 'faint'} center>
              {armed ? 'Toque de novo para excluir' : 'Excluir recorrência'}
            </Txt>
            {/* The owner will assume deleting the rule deletes the history. It does not. */}
            <Txt variant="micro" t="faint" center style={styles.removeNote}>
              Para de acontecer daqui para a frente. O que já foi lançado continua no razão.
            </Txt>
          </Press>
        ) : null}
      </KeyboardAwareScrollView>
    </>
  );
}


/**
 * The kind the draft should carry.
 *
 * `SHAPES` offers three, and the model has four: a card statement is the fourth, and this screen has
 * no control that can express it. Deriving the kind from the shape alone therefore *demotes* a card
 * series to `outflow` the moment anyone opens it and taps Salvar — which is not a cosmetic loss.
 * `spend.ts` identifies a statement payment by `kind: 'card'` precisely so it can be excluded from
 * spend, so the demoted series would start counting every statement as spend and report the same
 * grocery run twice. That is the exact class of quietly wrong number that module was written
 * against, and it would have arrived through a screen that never mentions cartões at all.
 *
 * So a kind the form cannot express is a kind the form must not overwrite: an existing series whose
 * shape maps back to what it already is keeps it.
 */
function kindOf(shape: Shape, existing: Series | null): SeriesKind {
  if (existing?.kind === 'card' && shape === 'out') return 'card';
  return shape === 'in' ? 'inflow' : shape === 'debt' ? 'debt' : 'outflow';
}

/**
 * Where a new series starts. **Called on creation only** — see the note at the call site.
 *
 * A debt with installments already paid did not start today — it started `paidCount` months ago, and
 * the engine numbers installments from `startDate`. Getting this wrong would make a debt 8 of 24
 * report as 1 of 24 on the very first projection.
 *
 * Getting it wrong *later* is worse, which is why this no longer runs on edit: every installment
 * number in the app and in a shared link is measured from here, so moving it renumbers history.
 */
function startDateFor(shape: Shape, paidCount: number, today: string): string {
  if (shape !== 'debt' || paidCount <= 0) return today;
  return dayKey(startOfMonth(subMonths(parseDay(today), paidCount)));
}

/** An integer inside a range, or null. */
function num(raw: string, lo: number, hi: number): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

const styles = StyleSheet.create({
  // The reading. Spacing is looser than the form's on purpose: a form is a queue of controls and
  // wants density, while this is meant to be taken in at a glance without scrolling.
  detailTitle: { paddingTop: space.sm, paddingBottom: space.xl },
  detailUnder: { paddingTop: space.xs },
  detailRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong, marginTop: space.xxl },
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
  /* Edge to edge, padded back to the gutter, so the category row can bleed — see lançar. */
  flex: { flex: 1, marginHorizontal: -space.gutter },
  scroll: { paddingTop: space.md, paddingBottom: space.xxxl, paddingHorizontal: space.gutter },
  gap: { height: space.lg },
  hint: { paddingTop: space.sm },

  shapes: { flexDirection: 'row' },
  shapeHit: { flex: 1 },
  shape: { justifyContent: 'flex-end', paddingBottom: space.sm },
  shapeRule: { height: 2, marginTop: space.sm, backgroundColor: color.hairline },
  shapeRuleOn: { backgroundColor: color.ink },
  shapeNote: { paddingTop: space.md },

  debtSides: { flexDirection: 'row', gap: space.sm },
  debtSideHit: { flex: 1 },
  debtSide: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    borderRadius: radius.md,
  },
  // Same "this one" as every chip: ink fill, ground-coloured text.
  debtSideOn: { borderColor: color.ink, backgroundColor: color.ink },

  groupLabel: { letterSpacing: 0.8, paddingTop: space.xl, paddingBottom: space.md },

  consequence: { paddingTop: space.xl },
  linkedNotice: { paddingTop: space.xl },
  consequenceRule: {
    height: 1,
    backgroundColor: color.hairlineStrong,
    marginBottom: space.md,
  },

  remove: { paddingTop: space.xxl },
  removeNote: { paddingTop: space.xs },
});
