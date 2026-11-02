import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeInLeft,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { addDays, addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { FlowAmount } from '@/ui/FlowAmount';
import { ChevronRight } from '@/ui/Icon';
import { DebtSharePanel } from '@/ui/DebtSharePanel';
import { RecurrenceDetail } from '@/ui/RecurrenceDetail';
import { Field } from '@/ui/Field';
import { MoneyField } from '@/ui/MoneyField';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Chip, ChipRow } from '@/ui/Chip';
import { categoryOrderFor } from '@/ui/choices';
import { Txt } from '@/theme/text';
import { color, font, radius, space, type } from '@/theme/tokens';
import { saidPlainly } from '@/lib/errors';
import { duration, ease, useReducedMotion } from '@/theme/motion';
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
  const { id, shape: presetParam } = useLocalSearchParams<{ id?: string; shape?: string }>();
  const preset: Shape | null =
    presetParam === 'out' || presetParam === 'in' || presetParam === 'debt' ? presetParam : null;
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

  const [shape, setShape] = useState<Shape>(preset ?? 'out');
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

  /**
   * Ends the rule, says so, and goes back to the list it was opened from — where the row folds out
   * of the group. A failure used to be silent: the promise had no catch, so a rejected write left the
   * owner on a screen that looked as if nothing had been asked of it.
   */
  const remove = async (): Promise<boolean> => {
    if (!existing) return false;
    try {
      await deleteSeries(existing.id);
      await load();
      snack(existing.kind === 'debt' ? 'Dívida excluída.' : 'Recorrência excluída.', 'info');
      router.back();
      return true;
    } catch (e) {
      snack(saidPlainly(e), 'error');
      return false;
    }
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
      snack(existing ? 'Recorrência salva.' : 'Recorrência criada.', 'info');
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
        onDelete={remove}
      />
    );
  }

  if (!existing) {
    return (
      <Steps
        preset={preset}
        shape={shape}
        setShape={setShape}
        debtDirection={debtDirection}
        setDebtDirection={setDebtDirection}
        title={title}
        setTitle={setTitle}
        counterparty={counterparty}
        setCounterparty={setCounterparty}
        category={category}
        setCategory={setCategory}
        categories={categories}
        amount={amount}
        setAmount={setAmount}
        day={day}
        setDay={setDay}
        total={total}
        setTotal={setTotal}
        paid={paid}
        setPaid={setPaid}
        dayOfMonth={dayOfMonth}
        totalCount={totalCount}
        paidCount={paidCount}
        preview={preview}
        valid={valid}
        saving={saving}
        onSave={() => void save()}
        today={today}
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
              void remove();
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


type Step = 'kind' | 'amount' | 'day' | 'details' | 'parcels' | 'review';

const FROM_RIGHT = FadeInRight.duration(duration.rule).easing(ease.out);
const FROM_LEFT = FadeInLeft.duration(duration.rule).easing(ease.out);

/* The kinds, said the way a person would describe the thing in front of them, with examples they
   recognise. The schema's words (outflow, inflow, debt) never reach this screen. */
const KINDS: { key: Shape; title: string; example: string }[] = [
  { key: 'out', title: 'Uma conta que sai todo mês', example: 'aluguel, internet, luz, academia, assinaturas' },
  { key: 'in', title: 'Um dinheiro que entra todo mês', example: 'salário, pensão, um aluguel que você recebe' },
  {
    key: 'debt',
    title: 'Uma compra parcelada ou dívida',
    example: 'tem número de parcelas: empréstimo, cartão parcelado, alguém que te paga aos poucos',
  },
];

/* Names people type most, one tap away. A suggestion only fills the field; it can still be edited. */
const NAMES: Record<Shape, string[]> = {
  out: ['Aluguel', 'Internet', 'Luz', 'Água', 'Celular', 'Academia', 'Streaming', 'Condomínio'],
  in: ['Salário', 'Freela', 'Pensão', 'Aluguel recebido', 'Bolsa'],
  debt: ['Empréstimo', 'Cartão parcelado', 'Financiamento', 'Celular parcelado'],
};

/**
 * Creating a recurrence, one question at a time.
 *
 * The form asked everything at once — three shapes in a row of capitals, a name, a money field, a
 * day typed as digits, installment counts, a chip row of categories — and a first-time owner had to
 * know what every field meant before the first one made sense. Here each screen asks one thing, in
 * a sentence, and the answer to the first (what kind of thing is this) shapes every question after
 * it. The day is a month to tap rather than a number to type. The last step reads the whole rule
 * back as it will appear, with its yearly cost, before anything is written.
 *
 * Someone who knows the app moves fast through it: choosing a kind or a day advances on its own, and
 * a kind chosen on the Fixas screen skips the first step entirely. Editing keeps the full form, which
 * is the faster tool once you know what you are changing.
 *
 * Back — the arrow or the system gesture — steps back through the questions before it leaves, so a
 * slip on step four never throws away the first three.
 */
function Steps({
  preset,
  shape,
  setShape,
  debtDirection,
  setDebtDirection,
  title,
  setTitle,
  counterparty,
  setCounterparty,
  category,
  setCategory,
  categories,
  amount,
  setAmount,
  day,
  setDay,
  total,
  setTotal,
  paid,
  setPaid,
  dayOfMonth,
  totalCount,
  paidCount,
  preview,
  valid,
  saving,
  onSave,
  today,
}: {
  preset: Shape | null;
  shape: Shape;
  setShape: (s: Shape) => void;
  debtDirection: 'out' | 'in';
  setDebtDirection: (d: 'out' | 'in') => void;
  title: string;
  setTitle: (t: string) => void;
  counterparty: string;
  setCounterparty: (t: string) => void;
  category: string;
  setCategory: (c: string) => void;
  categories: string[];
  amount: number | null;
  setAmount: (c: number | null) => void;
  day: string;
  setDay: (d: string) => void;
  total: string;
  setTotal: (t: string) => void;
  paid: string;
  setPaid: (t: string) => void;
  dayOfMonth: number | null;
  totalCount: number | null;
  paidCount: number;
  preview: { draft: Series; commitment: ReturnType<typeof commitmentFor> } | null;
  valid: boolean;
  saving: boolean;
  onSave: () => void;
  today: string;
}) {
  const reduced = useReducedMotion();
  const steps: Step[] = [
    ...(preset ? [] : (['kind'] as Step[])),
    'amount',
    'day',
    'details',
    ...(shape === 'debt' ? (['parcels'] as Step[]) : []),
    'review',
  ];
  const [index, setIndex] = useState(0);
  const dir = useRef(0);
  const step: Step = steps[index] ?? 'review';

  const go = (to: number) => {
    dir.current = Math.sign(to - index);
    setIndex(to);
  };
  const back = () => (index > 0 ? go(index - 1) : router.back());

  // The system Back walks the questions too; leaving is only the last step back.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) return false;
      go(index - 1);
      return true;
    });
    return () => sub.remove();
  });

  // A category the owner has not chosen follows the kind: an income opens on Renda, not on Outros.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current || !categories[0]) return;
    // A debt is rarely the kind of spending the most-used category names; Outros is the honest guess.
    setCategory(shape === 'debt' && categories.includes('Outros') ? 'Outros' : categories[0]);
  }, [shape, categories, setCategory]);

  useEffect(() => {
    if (step !== 'parcels') return;
    if (total === '') setTotal('12');
    if (paid === '') setPaid('0');
  }, [step, total, paid, setTotal, setPaid]);

  // One rule across the top, filling as the questions are answered.
  const progress = useSharedValue((index + 1) / steps.length);
  useEffect(() => {
    const to = (index + 1) / steps.length;
    progress.value = reduced ? to : withTiming(to, { duration: duration.rule, easing: ease.out });
  }, [index, steps.length, reduced, progress]);
  const filled = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  const ok =
    step === 'kind'
      ? true
      : step === 'amount'
        ? (amount ?? 0) > 0
        : step === 'day'
          ? dayOfMonth !== null
          : step === 'details'
            ? title.trim() !== ''
            : step === 'parcels'
              ? totalCount !== null && paidCount <= totalCount
              : valid;

  const verb = shape === 'in' ? 'entra' : 'sai';
  const heading: Record<Step, { title: string; sub: string }> = {
    kind: { title: 'O que você quer cadastrar?', sub: 'Algo que se repete todo mês. Escolha o tipo.' },
    amount: {
      title: shape === 'debt' ? 'Qual o valor de cada parcela?' : `Quanto ${verb} por mês?`,
      sub:
        shape === 'debt'
          ? 'O valor de uma parcela, não o total da dívida.'
          : 'Se o valor muda um pouco, coloque o mais comum. Dá para ajustar quando lançar.',
    },
    day: {
      title:
        shape === 'in' ? 'Que dia do mês costuma cair?' : shape === 'debt' ? 'Que dia vence a parcela?' : 'Que dia do mês vence?',
      sub: 'Toque no dia. Dia 31 cai no último dia dos meses mais curtos.',
    },
    details: {
      title: shape === 'debt' ? 'Conte um pouco sobre ela' : 'Como você chama isso?',
      sub: shape === 'debt' ? 'De que lado você está, e o nome que aparece no razão.' : 'É o nome que aparece no seu razão.',
    },
    parcels: {
      title: 'Quantas parcelas são?',
      sub: 'Conte também as que já foram pagas antes de cadastrar aqui.',
    },
    review: { title: 'Confira e crie', sub: 'É assim que vai aparecer nas suas fixas.' },
  };

  const entering = dir.current > 0 ? FROM_RIGHT : dir.current < 0 ? FROM_LEFT : undefined;

  return (
    <>
      <BackBar onPress={back} />
      <View style={styles.progress}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, filled]} />
        </View>
        <Txt variant="micro" t="faint" style={styles.progressLabel}>
          {`passo ${index + 1} de ${steps.length}`}
        </Txt>
      </View>

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View key={step} entering={entering}>
          <Txt variant="title" f="sansSemibold" style={styles.stepTitle}>
            {heading[step].title}
          </Txt>
          <Txt variant="body" t="muted" style={styles.stepSub}>
            {heading[step].sub}
          </Txt>

          {step === 'kind' ? (
            <View style={styles.kinds}>
              {KINDS.map((k) => (
                <Press
                  key={k.key}
                  onPress={() => {
                    setShape(k.key);
                    go(index + 1);
                  }}
                  scale={0.985}
                  style={[styles.kind, shape === k.key && index > 0 ? styles.kindOn : null]}
                  accessibilityLabel={`${k.title}. ${k.example}`}
                >
                  <View style={styles.kindText}>
                    <Txt variant="body" f="sansMedium">
                      {k.title}
                    </Txt>
                    <Txt variant="micro" t="faint" style={styles.kindExample}>
                      {k.example}
                    </Txt>
                  </View>
                  <ChevronRight tint={color.inkMuted} />
                </Press>
              ))}
            </View>
          ) : null}

          {step === 'amount' ? (
            <View style={styles.block}>
              <MoneyField
                label={shape === 'debt' ? 'Valor da parcela' : 'Valor por mês'}
                cents={amount}
                onChangeCents={setAmount}
                autoFocus
              />
            </View>
          ) : null}

          {step === 'day' ? (
            <DayGrid
              value={dayOfMonth}
              today={Number(today.slice(8))}
              onPick={(n) => {
                setDay(String(n));
                // Picking is answering. The short beat lets the chosen day be seen before it moves on.
                setTimeout(() => go(index + 1), 260);
              }}
            />
          ) : null}

          {step === 'details' ? (
            <View style={styles.block}>
              {shape === 'debt' ? (
                <>
                  <View style={styles.debtSides}>
                    {([
                      { key: 'out' as const, label: 'Eu devo' },
                      { key: 'in' as const, label: 'Me devem' },
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
                  <View style={styles.gap} />
                </>
              ) : null}

              <Field
                label="Nome"
                value={title}
                onChangeText={setTitle}
                autoCapitalize="sentences"
                maxLength={60}
                placeholder={`Ex.: ${NAMES[shape][0]}`}
              />
              <Wrap
                items={NAMES[shape]}
                selected={NAMES[shape].includes(title.trim()) ? title.trim() : null}
                onPick={setTitle}
              />

              {shape === 'debt' ? (
                <>
                  <View style={styles.gap} />
                  <Field
                    label={debtDirection === 'out' ? 'Para quem você deve (opcional)' : 'Quem deve para você (opcional)'}
                    value={counterparty}
                    onChangeText={setCounterparty}
                    autoCapitalize="words"
                    maxLength={80}
                    placeholder="Nome da pessoa ou da loja"
                  />
                </>
              ) : null}

              <Txt variant="micro" f="sansMedium" t="muted" style={styles.groupLabel}>
                CATEGORIA
              </Txt>
              <Wrap
                items={categories.includes(category) ? categories : [category, ...categories]}
                selected={category}
                onPick={(c) => {
                  touched.current = true;
                  setCategory(c);
                }}
              />
            </View>
          ) : null}

          {step === 'parcels' ? (
            <View style={styles.block}>
              <Counter
                label="Total de parcelas"
                value={totalCount ?? 0}
                min={1}
                max={480}
                onChange={(n) => setTotal(String(n))}
              />
              <Counter
                label="Já pagas"
                value={paidCount}
                min={0}
                max={totalCount ?? 480}
                onChange={(n) => setPaid(String(n))}
              />
              {totalCount !== null ? (
                <Txt variant="body" t="muted" style={styles.parcelsSay}>
                  {totalCount - paidCount === 0
                    ? 'Todas pagas. Ela entra já quitada.'
                    : `Faltam ${totalCount - paidCount} ${totalCount - paidCount === 1 ? 'parcela' : 'parcelas'}.`}
                </Txt>
              ) : null}
            </View>
          ) : null}

          {step === 'review' && preview ? (
            <Review preview={preview} shape={shape} totalCount={totalCount} />
          ) : null}

          {step !== 'kind' ? (
            <View style={styles.next}>
              <Button
                label={step === 'review' ? 'Criar recorrência' : 'Continuar'}
                onPress={() => (step === 'review' ? onSave() : go(index + 1))}
                disabled={!ok || saving}
                loading={saving}
              />
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAwareScrollView>
    </>
  );
}

/**
 * Choices that wrap onto the next line instead of running off the right edge. A row that bled past
 * the screen read, on this step, as a page laid out wrong — every option should be seen at once.
 */
function Wrap({
  items,
  selected,
  onPick,
}: {
  items: string[];
  selected: string | null;
  onPick: (item: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => (
        <Chip key={item} label={item} selected={selected === item} onPress={() => onPick(item)} />
      ))}
    </View>
  );
}

/**
 * A count set by tapping, with the figure large between − and +. Two empty numeric fields asked the
 * owner to type a number before seeing one; this starts from a number and is nudged to the right one.
 */
function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.counter}>
      <Txt variant="label" t="muted">
        {label}
      </Txt>
      <View style={styles.counterRow}>
        <Press
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          haptic="light"
          scale={0.9}
          style={styles.counterBtn}
          accessibilityLabel={`Menos uma em ${label}`}
        >
          <Txt variant="title" f="mono" t={value <= min ? 'faint' : 'ink'} center>
            −
          </Txt>
        </Press>
        {/* The figure is also a field: tap it and type 48 instead of pressing + forty-eight times. */}
        <TextInput
          value={String(value)}
          onChangeText={(t) => {
            const n = Number(t.replace(/D/g, '').slice(0, 3));
            if (t.replace(/D/g, '') !== '') onChange(Math.min(max, Math.max(min, n)));
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          maxLength={3}
          style={styles.counterValue}
          accessibilityLabel={label}
        />
        <Press
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          haptic="light"
          scale={0.9}
          style={styles.counterBtn}
          accessibilityLabel={`Mais uma em ${label}`}
        >
          <Txt variant="title" f="mono" t={value >= max ? 'faint' : 'ink'} center>
            +
          </Txt>
        </Press>
      </View>
    </View>
  );
}

/**
 * The month as a grid of days to tap. Typing "8" into a numeric field was the one step that asked
 * the owner to translate a date into a number; here the number *is* the date. Today carries a ring,
 * so "the 5th" has somewhere to be read against.
 */
function DayGrid({ value, today, onPick }: { value: number | null; today: number; onPick: (n: number) => void }) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => {
        const on = value === n;
        return (
          <Press
            key={n}
            onPress={() => onPick(n)}
            haptic="light"
            scale={0.9}
            hitSlop={0}
            outerStyle={styles.cellHit}
            style={[styles.cell, on ? styles.cellOn : n === today ? styles.cellToday : null]}
            accessibilityLabel={`Dia ${n}`}
            accessibilityState={{ selected: on }}
          >
            <Txt variant="body" f="mono" t={on ? 'onInk' : 'ink'} center tabular>
              {n}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** The rule read back as it will appear: name, figure, when, where, and what it adds up to. */
function Review({
  preview,
  shape,
  totalCount,
}: {
  preview: { draft: Series; commitment: ReturnType<typeof commitmentFor> };
  shape: Shape;
  totalCount: number | null;
}) {
  const { draft, commitment } = preview;
  return (
    <View style={styles.block}>
      <View style={styles.reviewHead}>
        <Txt variant="heading" f="sansSemibold" numberOfLines={2}>
          {draft.title}
        </Txt>
        <FlowAmount cents={draft.amountCents} direction={draft.direction} size="heading" />
      </View>
      <Fact label="quando" value={`todo dia ${draft.dayOfMonth}`} />
      <Fact label="categoria" value={draft.category} />
      {shape === 'debt' && commitment.remaining ? (
        <Fact
          label="faltam"
          value={`${commitment.remaining.count} de ${totalCount} · ${brlShort(commitment.remaining.cents)}`}
        />
      ) : (
        <Fact label="por ano" value={brlShort(commitment.yearCents)} />
      )}
      {shape === 'debt' && commitment.remaining ? (
        <Txt variant="micro" t="faint" style={styles.hint}>
          {`Termina em ${format(parseDay(commitment.remaining.finishes), "MMMM 'de' yyyy", { locale: ptBR })}.`}
        </Txt>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Txt variant="label" t="faint">
        {label}
      </Txt>
      <Txt variant="body" numberOfLines={1}>
        {value}
      </Txt>
    </View>
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

  // The steps.
  progress: { paddingTop: space.sm },
  progressTrack: { height: 2, borderRadius: 1, backgroundColor: color.hairline, overflow: 'hidden' },
  progressFill: { height: 2, borderRadius: 1, backgroundColor: color.ink, transformOrigin: 'left' },
  // A beat of air under the label, so the page scrolling up never touches it.
  progressLabel: { paddingTop: space.sm, paddingBottom: space.md },
  stepTitle: { paddingTop: space.lg },
  stepSub: { paddingTop: space.sm },
  block: { paddingTop: space.xl },
  next: { paddingTop: space.xxl },

  kinds: { paddingTop: space.xl, gap: space.md },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    borderRadius: radius.lg,
  },
  kindOn: { borderColor: color.ink },
  kindText: { flex: 1, paddingRight: space.md },
  kindExample: { paddingTop: space.xs },

  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: space.xl, rowGap: space.sm },
  /* A seventh of the row each, so the month reads as a calendar's week rows. */
  cellHit: { width: `${100 / 7}%`, alignItems: 'center' },
  cell: { width: 44, height: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cellOn: { backgroundColor: color.ink },
  cellToday: { borderWidth: 1, borderColor: color.hairlineStrong },

  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: space.md },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  counterBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    minWidth: 64,
    textAlign: 'center',
    fontFamily: font.monoSemibold,
    fontSize: type.title.size,
    color: color.ink,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  parcelsSay: { paddingTop: space.lg },

  reviewHead: { paddingBottom: space.lg, gap: space.sm },
  fact: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
});
