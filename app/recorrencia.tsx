import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { addMonths, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { DebtSharePanel } from '@/ui/DebtSharePanel';
import { Field } from '@/ui/Field';
import { MoneyField } from '@/ui/MoneyField';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Txt } from '@/theme/text';
import { color, radius, space } from '@/theme/tokens';
import { useSnackbar } from '@/ui/Snackbar';
import { useLedger } from '@/state/ledger';
import { deleteSeries, insertSeries, settleOccurrence, updateSeries } from '@/db/repo';
import { pickerOrder } from '@/domain/category';
import { dayKey, nextOpen, parseDay } from '@/domain/projection';
import { commitmentFor } from '@/domain/commitments';
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

const SHAPES: { key: Shape; label: string; note: string }[] = [
  { key: 'out', label: 'SAI', note: 'uma conta ou assinatura que se repete' },
  { key: 'in', label: 'ENTRA', note: 'salário ou outra renda que se repete' },
  { key: 'debt', label: 'TERMINA', note: 'uma dívida com um número de parcelas' },
];

function Form() {
  const snack = useSnackbar();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const series = useLedger((s) => s.series);
  const accounts = useLedger((s) => s.accounts);
  const entries = useLedger((s) => s.entries);
  const load = useLedger((s) => s.load);
  const storedCategories = useLedger((s) => s.categories);

  // The same vocabulary the lançamento screen offers, in the same order. Two lists that diverge
  // teach the owner to distrust both.
  const categories = useMemo(
    () => pickerOrder(entries, series, storedCategories),
    [entries, series, storedCategories],
  );

  const existing = useMemo(() => series.find((s) => s.id === id) ?? null, [series, id]);

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
  const [settling, setSettling] = useState(false);

  /*
   * What this rule still owes, and where an antecipação would land.
   *
   * `nextOpen` answers the first, and it is the whole reason the settlement is addressed by the
   * occurrence rather than by the calendar: the button has to name the day it is retiring, and after
   * it fires that day is gone from the projection while the rule itself is untouched.
   */
  const today = useMemo(() => dayKey(new Date()), []);
  const open = useMemo(
    () => (existing ? nextOpen(existing, entries, today) : null),
    [existing, entries, today],
  );
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

  const settleNow = async () => {
    if (!existing || !open || !settleAccount) return;
    setSettling(true);
    try {
      await settleOccurrence(existing.id, open.date, {
        id: Crypto.randomUUID(),
        date: today,
        amountCents: existing.amountCents,
        direction: existing.direction,
        title: existing.title,
        category: existing.category,
        accountId: settleAccount,
      });
      await load();
      snack(
        (existing.direction === 'in' ? 'Recebido' : 'Pago') +
          ' hoje. A próxima volta no mês que vem.',
        'info',
      );
      router.back();
    } catch (e) {
      setSettling(false);
      snack(e instanceof Error ? e.message : 'Não consegui lançar.', 'error');
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
    (shape !== 'debt' ||
      (counterparty.trim() !== '' && totalCount !== null && paidCount <= totalCount));

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
       * A debt always derives its start from how many installments are paid, on edit as well as on
       * create. The engine numbers installments from startDate, and `remaining` counts from
       * `paidCount` — they are two spellings of one fact. Preserving the old start while the owner
       * corrects "parcelas ja pagas" from 5 to 8 makes the two disagree: the razao would keep
       * numbering from the calendar while this screen counts four left.
       */
      startDate:
        shape === 'debt'
          ? startDateFor(shape, paidCount, today)
          : (existing?.startDate ?? today),
      endDate: existing?.endDate ?? null,
      totalCount: shape === 'debt' ? totalCount : null,
      paidCount: shape === 'debt' ? paidCount : 0,
      counterparty: shape === 'debt' ? counterparty.trim() : null,
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
      snack(e instanceof Error ? e.message : 'Não consegui salvar.', 'error');
    }
  };

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
                    t={debtDirection === option.key ? 'ink' : 'faint'}
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
              label={debtDirection === 'out' ? 'Para quem você deve' : 'Quem deve para você'}
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
          <MoneyField label="Valor da parcela" cents={amount} onChangeCents={setAmount} />
        </Reveal>

        <View style={styles.gap} />
        <Reveal index={3} {...ENTER}>
          <Field
            label="Dia do mês"
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
                value={total}
                onChangeText={(t) => setTotal(t.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad"
              />
              <View style={styles.gap} />
              <Field
                label="Parcelas já pagas"
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {categories.map((c) => (
              <Press
                key={c}
                onPress={() => setCategory(c)}
                scale={0.95}
                hitSlop={4}
                style={[styles.chip, category === c ? styles.chipOn : null]}
                accessibilityLabel={c}
                accessibilityState={{ selected: category === c }}
              >
                <Txt
                  variant="label"
                  f={category === c ? 'sansMedium' : 'sans'}
                  t={category === c ? 'ink' : 'muted'}
                >
                  {c}
                </Txt>
              </Press>
            ))}
          </ScrollView>
        </Reveal>

        {/*
          The consequence, while it is being typed. This is the figure the recurrences screen is
          built around, and watching R$ 262,80 appear as you type R$ 21,90 is the moment it works.
        */}
        {preview ? (
          <View style={styles.consequence}>
            <View style={styles.consequenceRule} />
            <Txt variant="body" t="ink">
              {shape === 'debt' && preview.commitment.remaining
                ? `Faltam ${preview.commitment.remaining.count} de ${totalCount}: ${brlShort(preview.commitment.remaining.cents)}, terminando em ${format(parseDay(preview.commitment.remaining.finishes), "MMM 'de' yyyy", { locale: ptBR })}.`
                : `${brlShort(preview.commitment.yearCents)} por ano.`}
            </Txt>
          </View>
        ) : null}

        {existing?.kind === 'debt' && !existing.linkedShareToken ? (
          <DebtSharePanel series={existing} />
        ) : null}

        {existing?.linkedShareToken ? (
          <View style={styles.linkedNotice}>
            <View style={styles.consequenceRule} />
            <Txt variant="body" t="ink">
              Acompanhamento conectado a {existing.counterparty}.
            </Txt>
            <Txt variant="micro" t="faint" style={styles.hint}>
              O progresso vem da dívida original. Só quem compartilhou confirma as parcelas.
            </Txt>
          </View>
        ) : null}

        {/*
          Antecipar, from the rule's own screen.
          
          The razão offers this on the forecast row, which is the right place when the owner is
          reading the tape. But the thought that starts this is usually about the rule — "meu salário
          caiu, e a regra diz dia 5" — and it arrives here, not there. So the same action, named by
          what is actually outstanding: the day it was due, and how far from today that is.

          It only appears while something is genuinely open. A rule whose turn this month is already
          settled has nothing to bring forward, and a button that would record a second copy of the
          salary is exactly the wrong thing to leave sitting under one that just did.
        */}
        {existing && open && settleAccount && !existing.linkedShareToken ? (
          <View style={styles.settle}>
            <Button
              label={
                (existing.direction === 'in' ? 'Recebi' : 'Paguei') +
                ' — lançar hoje'
              }
              variant="outline"
              onPress={() => void settleNow()}
              disabled={settling}
              loading={settling}
            />
            <Txt variant="micro" t="faint" center style={styles.settleNote}>
              {`Em aberto: ${format(parseDay(open.date), "d 'de' MMMM", { locale: ptBR })}. Lançando hoje, a próxima cai em ${format(addMonths(parseDay(open.date), 1), "d 'de' MMMM", { locale: ptBR })}.`}
            </Txt>
          </View>
        ) : null}

        <View style={styles.gap} />
        <Button
          label={existing ? 'Salvar' : 'Criar recorrência'}
          onPress={() => void save()}
          disabled={!valid || saving}
          loading={saving}
        />

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
            accessibilityLabel="Apagar recorrência"
          >
            <Txt variant="label" t={armed ? 'negative' : 'faint'} center>
              {armed ? 'Toque de novo para apagar' : 'Apagar recorrência'}
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
 * Where a new series starts.
 *
 * A debt with installments already paid did not start today — it started `paidCount` months ago, and
 * the engine numbers installments from `startDate`. Getting this wrong would make a debt 8 of 24
 * report as 1 of 24 on the very first projection.
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
  settle: { paddingTop: space.lg },
  settleNote: { paddingTop: space.sm },
  flex: { flex: 1 },
  scroll: { paddingTop: space.md, paddingBottom: space.xxxl },
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
  debtSideOn: { borderColor: color.hairlineStrong, backgroundColor: color.surfaceHi },

  groupLabel: { letterSpacing: 0.8, paddingTop: space.xl, paddingBottom: space.md },
  chips: { flexDirection: 'row', gap: space.sm, paddingRight: space.gutter },
  chip: {
    minHeight: 0,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  chipOn: { borderColor: color.hairlineStrong, backgroundColor: color.surface },

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
