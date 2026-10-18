import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Crypto from 'expo-crypto';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Backspace, ChevronRight } from '@/ui/Icon';
import { Chip, ChipRow } from '@/ui/Chip';
import { categoryOrderFor, MAX_CENTS } from '@/ui/choices';
import { MonthStepper } from '@/ui/MonthStepper';
import { Txt } from '@/theme/text';
import { color, radius, space } from '@/theme/tokens';
import { duration } from '@/theme/motion';
import { useSnackbar } from '@/ui/Snackbar';
import { saidPlainly } from '@/lib/errors';
import { useLedger } from '@/state/ledger';
import { deleteEntry, insertEntry, settleOccurrence, updateEntry } from '@/db/repo';
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dayKey, parseDay, project } from '@/domain/projection';
import { isStatementSeries, settled } from '@/domain/settlement';
import { statementCycle, withStatements } from '@/domain/card';
import { brl, brlShort, parts } from '@/domain/money';
import { capReading } from '@/domain/cap';
import type { Direction, Occurrence } from '@/domain/model';

const ENTER = { delay: 40, step: 70, cap: 5, rise: 10 } as const;

/**
 * Recording, which PRODUCT.md names as the product itself.
 *
 * The whole screen is arranged around that claim. The figure is entered on a keypad this app draws
 * rather than on the system keyboard, because the system keyboard costs a layout shift and arrives
 * with a decimal point that has no meaning here — the value is centavos all the way down, so digits
 * push in from the right and the separator places itself. Description and category are optional and
 * sit above the keypad; a lançamento with an amount and a category is already worth more than one
 * the owner abandoned halfway.
 *
 * Nothing here is a card. The keypad is a grid of hairline cells, which is the same ledger geometry
 * as the rest of the app at a different scale.
 *
 * The same screen edits a lançamento already recorded, reached with an `id` — the same pattern
 * `recorrencia` already uses for its two shapes. Editing keeps the original date and, if there is
 * one, the original `seriesId`: fixing a typo in the amount is not a reason for a settlement to
 * forget what it settled. What changes is only what the owner touches.
 */
export default function Lancar() {
  const snack = useSnackbar();
  const { id, settlesSeries, settlesDate } = useLocalSearchParams<{
    id?: string;
    /** A forecast to settle, named by the screen that sent us here. See `requested` below. */
    settlesSeries?: string;
    settlesDate?: string;
  }>();
  const accounts = useLedger((s) => s.accounts);
  const entries = useLedger((s) => s.entries);
  const series = useLedger((s) => s.series);
  const caps = useLedger((s) => s.caps);
  const storedCategories = useLedger((s) => s.categories);
  const deferrals = useLedger((s) => s.deferralsBySlot);
  const today = useMemo(() => dayKey(new Date()), []);
  const load = useLedger((s) => s.load);

  const existing = useMemo(() => entries.find((e) => e.id === id) ?? null, [entries, id]);

  const [cents, setCents] = useState(0);
  const [direction, setDirection] = useState<Direction>('out');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  /** Null until the owner picks, or until the ledger offers exactly one and the effect below does. */
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** A destructive action arms itself and stands down on its own — same rule as ajustes' reseed. */
  const [armed, setArmed] = useState(false);
  /** The occurrence this lançamento settles, when the owner says it settles one. */
  const [settles, setSettles] = useState<Occurrence | null>(null);
  /** The day the money moved. Defaults to today; the owner may backdate, never postdate — an entry
      is a fact, and a fact cannot sit in the future. */
  const [date, setDate] = useState(today);
  /** `HH:mm`, or empty for "the owner did not say". Free text, formatted as it is typed. */
  const [time, setTime] = useState('');
  const [timeTouched, setTimeTouched] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  // The store already held the ledger by the time this screen was reached from razão or lançar
  // itself, so this fills the form once rather than fighting whatever the owner has since typed.
  useEffect(() => {
    if (!existing) return;
    setCents(existing.amountCents);
    setDirection(existing.direction);
    setTitle(existing.title);
    setCategory(existing.category);
    setAccountId(existing.accountId);
    setDate(existing.date);
    setTime(existing.time ?? '');
  }, [existing]);

  // A settlement is dated today by definition — see `settleOccurrence`'s own note. Choosing one
  // after having backdated the form would leave the date on screen contradicting what Salvar is
  // about to write, so the chip take back the one day a settlement is allowed to have.
  useEffect(() => {
    if (settles) setDate(today);
  }, [settles, today]);

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const timeValid = time === '' || TIME_RE.test(time);

  const onTimeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setTime(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
    setTimeTouched(false);
  };

  /**
   * Everywhere a lançamento can land, accounts before cards.
   *
   * Cards are offered now, and that is the point of this pass: most of a Brazilian month is spent
   * on one. What changes is not the recording but the consequence — charging a card moves no
   * balance today, it joins a statement that will. The screen says so rather than leaving the owner
   * to notice that the figure on the home screen did not move.
   */
  const payFrom = useMemo(
    () => [...accounts.filter((a) => a.kind !== 'card'), ...accounts.filter((a) => a.kind === 'card')],
    [accounts],
  );

  const chosen = payFrom.find((a) => a.id === accountId) ?? payFrom[0] ?? null;
  const onCard = chosen?.kind === 'card';
  const cycle = useMemo(
    () => (chosen && onCard ? statementCycle(chosen, dayKey(new Date())) : null),
    [chosen, onCard],
  );

  // The ledger arrives after the first render, so the default cannot be an initial state.
  useEffect(() => {
    if (accountId === null && payFrom[0]) setAccountId(payFrom[0].id);
  }, [accountId, payFrom]);

  // The owner's own vocabulary first, ordered by how much they actually use it — in *this*
  // direction. A category list that does not learn is a list the owner scrolls past every single
  // time, and one that offers "Renda" first on a Saída has not been listening. See
  // `categoryOrderFor`: names used the other way are moved to the end, never removed.
  const categories = useMemo(
    () => categoryOrderFor(direction, entries, series, storedCategories),
    [direction, entries, series, storedCategories],
  );

  /** What Salvar writes when no category was chosen — shown in the summary so it is never a surprise. */
  const fallbackCategory = direction === 'in' ? 'Renda' : 'Outros';

  /**
   * Which picker is unfolded under the summary row, if any. One at a time: two chip rows open at
   * once would push the description off the screen, which is the problem the summary row solves.
   */
  const [picker, setPicker] = useState<'category' | 'account' | null>(null);

  /*
   * A category is never "created" in this app — see `domain/category`'s own note: it exists the
   * moment something is recorded under its name, dressed automatically from the name itself. This
   * is only the chip list catching up to that truth. A name typed here that Salvar has not written
   * yet has nowhere to come from in `pickerOrder`, so it is held here just long enough to render its
   * own chip, selected, until the entry that makes it real is saved.
   */
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');

  const categoryOptions = useMemo(() => {
    if (!newCategory) return categories;
    const key = newCategory.trim().toLocaleLowerCase('pt-BR');
    return categories.some((c) => c.toLocaleLowerCase('pt-BR') === key)
      ? categories
      : [newCategory, ...categories];
  }, [categories, newCategory]);

  const commitCategory = () => {
    const trimmed = categoryDraft.trim();
    setCategoryDraft('');
    setAddingCategory(false);
    if (!trimmed) return;
    // Typed in a hurry, matched the way every other category comparison in this app already is: a
    // name that only differs in case selects the one that exists rather than shadowing it with a
    // near-duplicate chip.
    const key = trimmed.toLocaleLowerCase('pt-BR');
    const known = categories.find((c) => c.toLocaleLowerCase('pt-BR') === key);
    setCategory(known ?? trimmed);
    if (!known) setNewCategory(trimmed);
  };

  /**
   * What this lançamento does to a ceiling — said before it is recorded, not after.
   *
   * The scheduled alert in `alerts.ts` fires on the pace of a month; this one answers a narrower and
   * more urgent question the owner is holding while their card is still in their hand: *does this
   * one put me through?* It is the only place in the app where a ceiling is measured against money
   * that has not moved yet.
   *
   * Silent unless it matters, on the same rule as everything else that speaks here: no ceiling, no
   * amount typed, or a purchase the ceiling absorbs without noticing all produce nothing.
   */
  const capWarning = useMemo(() => {
    if (!category || cents <= 0 || direction !== 'out') return null;
    const key = category.trim().toLocaleLowerCase('pt-BR');
    const cap = caps.find((c) => c.category.trim().toLocaleLowerCase('pt-BR') === key);
    if (!cap) return null;

    // Read against the month this lançamento actually lands in — its own `date`, not today's. A
    // backdated purchase measured against the wrong month would name a ceiling it never touched
    // and stay silent about the one it did, which is worse than saying nothing.
    const reading = capReading(cap, entries, series, date);
    const after = reading.spent + cents;
    if (after <= cap.capCents) return null;

    return reading.spent >= cap.capCents
      ? `${category} já passou do teto de ${brlShort(cap.capCents)}. Com isto, vai a ${brlShort(after)}.`
      : `Com isto, ${category} passa do teto de ${brlShort(cap.capCents)} em ${brlShort(after - cap.capCents)}.`;
  }, [category, cents, direction, caps, entries, series, date]);

  /**
   * What the ledger is still waiting on, this month.
   *
   * The reason this row exists at all: "recebi meu salário hoje, mas lá tá só dia 5" is the most
   * ordinary thing a lançamento can be, and without a way to say so from *this* screen the owner
   * records the money and the engine goes on projecting the 5th anyway — the same salary twice. The
   * two other places that can retire an occurrence (a swipe in the razão, the rule's own screen) are
   * both places you go to *read*. This is where you go when money has just moved.
   *
   * Only the current month, and only what nothing has settled yet. Reaching further ahead would let
   * a single tap quietly retire a bill two months out, which is not what "recebi hoje" ever means.
   */
  /**
   * What can be settled from here: the rules, and each card's statement still to pay — a fatura is
   * paid exactly the way a bill is, and from this same keypad. See `withStatements`.
   */
  const forecast = useMemo(
    () => withStatements(accounts, entries, series, today),
    [accounts, entries, series, today],
  );

  const openNow = useMemo(() => {
    if (existing) return [];
    const t = parseDay(dayKey(new Date()));
    const from = dayKey(new Date(t.getFullYear(), t.getMonth(), 1));
    const to = dayKey(new Date(t.getFullYear(), t.getMonth() + 1, 0));
    return project(forecast, from, to, settled(entries), deferrals).filter((o) => o.direction === direction);
  }, [existing, forecast, entries, deferrals, direction]);

  /**
   * A forecast the owner asked to settle from somewhere else — the razão's swipe, a rule's own
   * screen.
   *
   * Those two places used to write the settlement themselves, at the figure the rule predicted.
   * That is right for the salary that lands exactly as written and wrong for every bonus, every
   * bill that came in higher, every month the number simply differs — and the owner had no way to
   * say so except to record it and then go delete the copy the rule made. So they send the
   * occurrence here instead, where there is a keypad.
   *
   * Resolved from the params rather than picked out of `openNow`, which only reaches to the end of
   * the current month: a bill due in November is a perfectly ordinary thing to settle early, and it
   * would not be in that list to preselect from.
   */
  const requested = useMemo(() => {
    if (!settlesSeries || !settlesDate) return null;
    const d = parseDay(settlesDate);
    const from = dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return (
      project(forecast, from, to, settled(entries), deferrals).find(
        (o) => o.seriesId === settlesSeries && o.date === settlesDate,
      ) ?? null
    );
  }, [settlesSeries, settlesDate, forecast, entries, deferrals]);

  /*
   * Applied once. After this the form belongs to the owner — re-running it would snap the figure
   * they are in the middle of retyping back to the rule's, which is the one thing this whole
   * change exists to stop.
   */
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || !requested) return;
    filled.current = true;
    // Direction goes in the same commit as `settles`, or the effect below reads the form's default
    // `'out'` against an `'in'` occurrence and clears the selection on the first frame.
    setDirection(requested.direction);
    setCents(requested.amountCents);
    setTitle(requested.title);
    setCategory(requested.category);
    // Where the rule already says it lands, which is the reason `Occurrence` carries an account.
    setAccountId(requested.accountId);
    setSettles(requested);
  }, [requested]);

  // A chosen occurrence whose direction the owner then flipped is no longer the one they meant.
  useEffect(() => {
    if (settles && settles.direction !== direction) setSettles(null);
  }, [settles, direction]);

  const money = parts(cents);
  const ready = cents > 0;

  /*
   * Leaving with something typed asks once.
   *
   * Back used to throw away a figure mid-entry without a word — the most expensive thing to lose on
   * the screen whose whole promise is speed. The guard is the same two-tap rule every destructive
   * row in this app uses, applied to Back: the first press stops and says what would be lost, a
   * second within a few seconds leaves. It catches the system Back too (`beforeRemove`), since that
   * is how most people leave a screen on Android. A save, a delete, or an untouched form passes
   * straight through.
   */
  const navigation = useNavigation();
  const dirty =
    !saved &&
    !saving &&
    (existing
      ? cents !== existing.amountCents ||
        direction !== existing.direction ||
        title !== existing.title ||
        category !== existing.category ||
        accountId !== existing.accountId ||
        date !== existing.date ||
        time !== (existing.time ?? '')
      : cents > 0 || title.trim() !== '');
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const leaveArmed = useRef(false);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!dirtyRef.current || leaveArmed.current) return;
        e.preventDefault();
        leaveArmed.current = true;
        setTimeout(() => {
          leaveArmed.current = false;
        }, 4000);
        snack(
          existing ? 'Voltar de novo descarta as alterações.' : 'Voltar de novo descarta este lançamento.',
          'info',
        );
      }),
    [navigation, snack, existing],
  );

  const push = (digit: number) =>
    setCents((c) => Math.min(MAX_CENTS, c * 10 + digit));
  const pushPair = () => setCents((c) => Math.min(MAX_CENTS, c * 100));
  const drop = () => setCents((c) => Math.floor(c / 10));

  const save = async () => {
    if (!ready || saving) return;
    if (!timeValid) {
      setTimeTouched(true);
      snack('Hora inválida. Use HH:MM.', 'error');
      return;
    }
    const account = chosen;
    if (!account) {
      snack('Nenhuma conta encontrada.', 'error');
      return;
    }
    // A statement paid from a card would retire the bill while moving no money anywhere the
    // balance can see. `settleOccurrence` refuses it too; saying it here says it in words.
    if (!existing && settles && isStatementSeries(settles.seriesId) && account.kind === 'card') {
      snack('A fatura se paga de uma conta, não de um cartão.', 'error');
      return;
    }

    setSaving(true);
    try {
      const chosen = category ?? fallbackCategory;
      const time_ = time === '' ? null : time;
      if (existing) {
        await updateEntry({
          ...existing,
          amountCents: cents,
          direction,
          title: title.trim() || chosen,
          category: chosen,
          accountId: account.id,
          date,
          // A settlement recorded before `settlesDate` existed relies on `date` itself as the key
          // that says which occurrence it retired — see `settled()`. Moving `date` out from under
          // that key on a plain edit would hand the occurrence back to the projection, and the
          // month would show the same money twice. Pin the key here, once, before it moves.
          settlesDate: existing.settlesDate ?? (existing.seriesId ? existing.date : null),
          time: time_,
        });
      } else if (settles) {
        /*
         * Settling, rather than merely recording.
         *
         * Same entry, dated today, plus the day it accounts for. That pair is what stops the
         * projection billing this occurrence again on its own day, and what makes the rule's next
         * turn next month — untouched, on the day the owner set.
         */
        await settleOccurrence(settles.seriesId, settles.date, {
          id: Crypto.randomUUID(),
          date: dayKey(new Date()),
          time: time_,
          amountCents: cents,
          direction,
          title: title.trim() || chosen,
          category: chosen,
          accountId: account.id,
        });
      } else {
        await insertEntry({
          id: Crypto.randomUUID(),
          seriesId: null,
          settlesDate: null,
          date,
          time: time_,
          recordedAt: new Date().toISOString(),
          amountCents: cents,
          direction,
          title: title.trim() || chosen,
          category: chosen,
          accountId: account.id,
        });
      }
      await load();
      setSaved(true);
      // The confirmation on the button is allowed to land before the screen changes underneath it.
      setTimeout(() => router.back(), 420);
    } catch (e) {
      setSaving(false);
      snack(saidPlainly(e), 'error');
    }
  };

  const remove = async () => {
    if (!existing || saving) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setSaving(true);
    try {
      await deleteEntry(existing.id);
      await load();
      router.back();
    } catch (e) {
      setSaving(false);
      snack(saidPlainly(e), 'error');
    }
  };

  const settleItems =
    settles && !openNow.some((o) => o.seriesId === settles.seriesId && o.date === settles.date)
      ? [settles, ...openNow]
      : openNow;
  const settleKey = (o: Occurrence) => o.seriesId + '@' + o.date;

  return (
    <Screen>
      <BackBar />

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          Editing says so. Without a title the edit form was indistinguishable from a new
          lançamento already filled in, and Salvar on it rewrites a fact the owner recorded days
          ago — worth one line of context, never a whole header.
        */}
        {existing ? (
          <Reveal index={0} {...ENTER} rise={0}>
            <Txt variant="heading" f="sansSemibold">
              Editar lançamento
            </Txt>
            <Txt variant="micro" t="faint" style={styles.editSub}>
              {`Lançado em ${format(parseDay(existing.date), "d 'de' MMMM", { locale: ptBR })}`}
            </Txt>
          </Reveal>
        ) : null}

        <Reveal index={0} {...ENTER} rise={0}>
          <Segmented value={direction} onChange={setDirection} />
        </Reveal>

        {/*
          The figure, in the display slot this world reserves for the one number that matters. It is
          a readout rather than an input: there is no caret, because there is no position — a digit
          always enters at the right.

          It also takes the screen's slack, rather than the bottom of the screen taking it. With the
          keypad anchored to the thumb and everything above it sized to itself, the leftover height
          used to pool into one dead band above the keys. Giving it to the readout puts the empty
          space around the one thing this screen exists for.
        */}
        <Reveal index={1} {...ENTER} style={styles.readoutBlock}>
          <View
            style={styles.readout}
            accessibilityRole="text"
            accessibilityLabel={`Valor ${money.symbol} ${money.whole},${money.cents}`}
          >
            <Txt variant="body" f="mono" t="faint" style={styles.symbol}>
              {money.symbol}
            </Txt>
            <Txt
              variant="display"
              f="monoSemibold"
              t={cents === 0 ? 'faint' : direction === 'out' ? 'negative' : 'positive'}
              tabular
            >
              {money.whole}
            </Txt>
            <Txt variant="body" f="mono" t="faint" tabular style={styles.decimals}>
              ,{money.cents}
            </Txt>
          </View>
        </Reveal>

        {/*
          Where the money goes and where it comes from, stated under the figure — always on screen.

          Category and account used to sit below "Quando", under the fold of a keypad that takes the
          bottom half of the panel, so the default account was chosen for the owner where they could
          not see it (LANC-02). Two cells, each a reading first and a control second: the value is
          always visible, and a tap unfolds the chip row right here instead of sending the owner
          scrolling. A category nobody chose shows the one Salvar will write, in faint ink, so an
          implicit "Outros" is never a surprise in the razão.
        */}
        <Reveal index={2} {...ENTER} rise={0}>
          <View style={styles.summary}>
            <SummaryCell
              label="CATEGORIA"
              value={category ?? fallbackCategory}
              implicit={!category}
              open={picker === 'category'}
              onPress={() => setPicker((p) => (p === 'category' ? null : 'category'))}
            />
            <View style={styles.summaryGap} />
            <SummaryCell
              label={onCard ? 'CARTÃO' : 'CONTA'}
              value={chosen?.name ?? '—'}
              open={picker === 'account'}
              // One account is not a decision; the cell still says where the money lands.
              onPress={
                payFrom.length > 1
                  ? () => setPicker((p) => (p === 'account' ? null : 'account'))
                  : undefined
              }
            />
          </View>

          {picker === 'category' ? (
            <Animated.View entering={FadeIn.duration(duration.state)} style={styles.pickerRow}>
              <ChipRow
                items={categoryOptions.map((c) => ({ key: c, label: c }))}
                selected={category}
                onPick={(c) => {
                  setCategory((prev) => (prev === c ? null : c));
                  setAddingCategory(false);
                  setPicker(null);
                }}
                after={
                  <Chip
                    label="+ Nova categoria"
                    selected={addingCategory}
                    onPress={() => setAddingCategory((o) => !o)}
                  />
                }
              />
            </Animated.View>
          ) : null}

          {/*
            One field, one name, done — the same restraint `domain/category` argues for: no icon to
            pick, no cor to choose, no teto to set before the lançamento this screen exists for can
            be saved. Those are real things an owner may eventually want, and `categorias.tsx` is
            where dressing a category already lives; asking for them here would put that toll gate
            back in the one place this app has gone out of its way to remove it from.
          */}
          {picker === 'category' && addingCategory ? (
            <Animated.View entering={FadeIn.duration(duration.state)}>
              <Field
                label="Nova categoria"
                value={categoryDraft}
                onChangeText={setCategoryDraft}
                autoCapitalize="sentences"
                returnKeyType="done"
                maxLength={30}
                autoFocus
                onSubmitEditing={() => {
                  commitCategory();
                  setPicker(null);
                }}
                trailing={{
                  label: 'Adicionar',
                  onPress: () => {
                    commitCategory();
                    setPicker(null);
                  },
                }}
              />
            </Animated.View>
          ) : null}

          {picker === 'account' ? (
            <Animated.View entering={FadeIn.duration(duration.state)} style={styles.pickerRow}>
              <ChipRow
                items={payFrom.map((a) => ({ key: a.id, label: a.name }))}
                selected={chosen?.id ?? null}
                onPick={(id) => {
                  setAccountId(id);
                  setPicker(null);
                }}
              />
            </Animated.View>
          ) : null}

          {/*
            Stated, never enforced. It is the owner's money and their ceiling, and a form that
            refused the lançamento would be the app deciding it knows better than the person holding
            the card. Telling them is the whole job.
          */}
          {capWarning ? (
            <Animated.View entering={FadeIn.duration(duration.state)} style={styles.capWarn}>
              <View style={styles.capWarnRule} />
              <Txt variant="micro" t="negative">
                {capWarning}
              </Txt>
            </Animated.View>
          ) : null}

          {/*
            The consequence, said where the choice is made.

            Charging a card moves no balance today — `balanceToday`, the curve and the tape all skip
            credit lines — so without this line the owner records a purchase, returns to the home
            screen, sees the figure unchanged and concludes the app lost it. Only rendered when a card
            is actually chosen, so it never becomes furniture.
          */}
          {onCard ? (
            <Txt variant="micro" t="faint" style={styles.accountNote}>
              {cycle
                ? `Não sai do seu saldo agora. Entra na fatura que fecha em ${format(
                    parseDay(cycle.closes),
                    "d 'de' MMM",
                    { locale: ptBR },
                  )}.`
                : 'Não sai do seu saldo agora. Entra na fatura deste cartão.'}
            </Txt>
          ) : null}
        </Reveal>

        {/*
          Optional, and the placeholder says what happens if it stays empty. Once there is a figure,
          the keyboard's action key records the lançamento: with the system keyboard up, the keypad
          and the CTA sit under it (the window pans rather than resizes), and a "done" that only
          dropped focus left the owner one hidden step from finishing (LANC-07).
        */}
        <Reveal index={2} {...ENTER}>
          <Field
            label="Descrição"
            value={title}
            onChangeText={setTitle}
            placeholder={`Opcional · fica “${category ?? fallbackCategory}”`}
            autoCapitalize="sentences"
            returnKeyType={ready ? 'send' : 'done'}
            onSubmitEditing={ready ? () => void save() : undefined}
            maxLength={60}
          />
        </Reveal>

        {/*
          Antecipar, from the screen where money actually gets recorded.

          Tapping one says "este lançamento é aquele compromisso" — it fills the figure, the nome and
          a categoria, and on Salvar it retires that occurrence instead of adding a second copy of it
          to the month. Tapping again lets it go, because the owner is allowed to change their mind
          about what they just told the app.

          Present when there is something outstanding in this direction this month, and also when the
          choice was already made for us: a settlement sent in from the razão can name an occurrence
          further out than this month, which `openNow` does not reach — without this the owner would
          meet a form filled with a figure and no statement of what Salvar is about to retire.
        */}
        {settleItems.length > 0 ? (
          <Reveal index={2} {...ENTER} rise={0}>
            <Txt variant="micro" f="sansMedium" t="muted" style={styles.groupLabel}>
              {direction === 'in' ? 'JÁ RECEBI' : 'JÁ PAGUEI'}
            </Txt>
            <ChipRow
              items={settleItems.map((o) => ({
                key: settleKey(o),
                label: `${o.title} · dia ${Number(o.date.slice(8))}`,
              }))}
              selected={settles ? settleKey(settles) : null}
              onPick={(key) => {
                const o = settleItems.find((x) => settleKey(x) === key);
                if (!o) return;
                setSettles((prev) => {
                  if (prev && settleKey(prev) === key) return null;
                  setCents(o.amountCents);
                  setTitle(o.title);
                  setCategory(o.category);
                  return o;
                });
              }}
            />
            {settles ? (
              <Txt variant="micro" t="faint" style={styles.settleNote}>
                {/* A statement does not "come back next month" — the next one is a different bill,
                    whatever the card collects — and paying less than it leaves the rest owed. */}
                {isStatementSeries(settles.seriesId)
                  ? cents < settles.amountCents
                    ? `Lançado hoje. Os ${brl(settles.amountCents - cents)} que faltam continuam previstos no dia ${Number(settles.date.slice(8))}.`
                    : `Lançado hoje. A fatura sai do dia ${Number(settles.date.slice(8))} e não conta como gasto.`
                  : `Lançado hoje. ${settles.title} some do dia ${Number(settles.date.slice(8))} e volta no mês que vem.`}
              </Txt>
            ) : null}
          </Reveal>
        ) : null}

        {/*
          When, not just what. `date` may only ever look backward: an entry is something that already
          happened, and letting it point forward would make it indistinguishable from a projection.

          Locked to hoje the moment a settlement is chosen above — see the effect that enforces it —
          because `settleOccurrence` is dated today by contract. The section then says "Hoje" rather
          than going blank: an empty "Quando" read as a broken control (LANC-06).
        */}
        <Reveal index={3} {...ENTER} rise={0}>
          <Txt variant="micro" f="sansMedium" t="muted" style={styles.groupLabel}>
            QUANDO
          </Txt>
          {settles ? (
            <Txt variant="body" t="muted">
              {`Hoje, ${format(parseDay(today), "d 'de' MMMM", { locale: ptBR })}`}
            </Txt>
          ) : (
            <DateSection date={date} today={today} onChange={setDate} />
          )}
          <Field
            label="Hora (opcional)"
            value={time}
            onChangeText={onTimeChange}
            onBlur={() => setTimeTouched(true)}
            error={timeTouched && !timeValid ? 'Use o formato HH:MM.' : null}
            placeholder="--:--"
            keyboardType="number-pad"
            maxLength={5}
            numeric
            trailing={{ label: 'Agora', onPress: () => setTime(format(new Date(), 'HH:mm')) }}
          />
        </Reveal>
      </KeyboardAwareScrollView>

      <Reveal index={5} {...ENTER} rise={0}>
        <Keypad onDigit={push} onPair={pushPair} onDrop={drop} />
        <View style={styles.submit}>
          <Button
            label={
              existing
                ? 'Salvar'
                : settles
                  ? // The same words the rule's own screen uses for the same act.
                    `${direction === 'in' ? 'Recebi' : 'Paguei'} — lançar hoje`
                  : onCard
                    ? direction === 'out'
                      ? 'Lançar no cartão'
                      : 'Lançar estorno'
                    : direction === 'out'
                      ? 'Lançar saída'
                      : 'Lançar entrada'
            }
            onPress={() => void save()}
            loading={saving && !saved}
            success={saved}
            disabled={!ready}
          />

          {/*
            The gesture-free path to the same delete a swipe on the razão row already offers — this
            screen is reached that way too (a plain tap), and once here the action has to exist
            without requiring the owner to go back and swipe correctly a second time.
          */}
          {existing ? (
            <Press
              onPress={() => void remove()}
              disabled={saving}
              style={styles.remove}
              accessibilityLabel={armed ? 'Toque de novo para excluir' : 'Excluir lançamento'}
            >
              <Txt variant="label" t={armed ? 'negative' : 'faint'} center>
                {armed ? 'Toque de novo para excluir' : 'Excluir lançamento'}
              </Txt>
            </Press>
          ) : null}
        </View>
      </Reveal>
    </Screen>
  );
}

/**
 * One half of the summary row: a label, the value it currently holds, and — when there is a
 * choice — a chevron that turns as the picker unfolds. The open cell carries the ink rule the
 * segmented control uses for "this one", so the row says which picker the chips below belong to.
 */
function SummaryCell({
  label,
  value,
  implicit = false,
  open,
  onPress,
}: {
  label: string;
  value: string;
  implicit?: boolean;
  open: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Txt variant="micro" f="sansMedium" t="muted" style={styles.summaryLabel}>
        {label}
      </Txt>
      <View style={styles.summaryValue}>
        <Txt variant="body" t={implicit ? 'faint' : 'ink'} numberOfLines={1} style={styles.shrink}>
          {value}
        </Txt>
        {onPress ? (
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
            <ChevronRight size={14} tint={color.inkMuted} />
          </View>
        ) : null}
      </View>
      <View style={[styles.summaryRule, open ? styles.summaryRuleOn : null]} />
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.summaryCell} accessible accessibilityLabel={`${label}: ${value}`}>
        {body}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      scale={0.98}
      outerStyle={styles.summaryCell}
      accessibilityLabel={`${label}: ${value}${implicit ? ', padrão' : ''}. Toque para trocar.`}
      accessibilityState={{ selected: open }}
    >
      {body}
    </Press>
  );
}

/**
 * In or out, as a ruled pair rather than a switch.
 *
 * The selected side is marked by a rule under it — the same mark the tab bar uses for "you are
 * here", because it is the same statement. A pill or a toggle would be a second grammar for
 * selection in an app that already has one.
 */
function Segmented({
  value,
  onChange,
}: {
  value: Direction;
  onChange: (d: Direction) => void;
}) {
  return (
    <View style={styles.segmented}>
      {(['out', 'in'] as const).map((d) => {
        const on = value === d;
        return (
          <Press
            key={d}
            onPress={() => onChange(d)}
            scale={0.98}
            outerStyle={styles.segmentHit}
            style={styles.segment}
            accessibilityLabel={d === 'out' ? 'Saída' : 'Entrada'}
            accessibilityState={{ selected: on }}
          >
            <Txt
              variant="label"
              f="sansMedium"
              t={on ? (d === 'out' ? 'negative' : 'positive') : 'faint'}
              center
            >
              {d === 'out' ? 'SAÍDA' : 'ENTRADA'}
            </Txt>
            <View
              style={[
                styles.segmentRule,
                on
                  ? { backgroundColor: d === 'out' ? color.negative : color.positive }
                  : null,
              ]}
            />
          </Press>
        );
      })}
    </View>
  );
}

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

/**
 * Hoje, ontem, or a day reached through the same month grid `calendario` reads with — chosen here
 * rather than typed, because a date typed digit by digit is four chances to write the wrong year.
 *
 * The grid never opens past today: every cell after it is disabled the same way a chevron past
 * `max` already is on the calendar screen, which is what keeps "a fact about the world" from ever
 * pointing at a day that has not happened yet.
 */
function DateSection({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const yesterday = useMemo(() => dayKey(addDays(parseDay(today), -1)), [today]);
  const isOther = date !== today && date !== yesterday;
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(() => dayKey(startOfMonth(parseDay(date))));
  // However far back a backdate reasonably reaches — generous, and only a scroll limit, never a
  // rule about the ledger's actual history.
  const min = useMemo(() => dayKey(startOfMonth(subMonths(parseDay(today), 24))), [today]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const grid = useMemo(() => {
    const monthStart = startOfMonth(parseDay(anchor));
    const from = dayKey(monthStart);
    const to = dayKey(endOfMonth(monthStart));
    const first = startOfWeek(monthStart, { weekStartsOn: 1 });
    const last = endOfWeek(parseDay(to), { weekStartsOn: 1 });
    const cells: string[] = [];
    for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) cells.push(dayKey(cursor));
    const era: 'past' | 'current' | 'future' = to < today ? 'past' : from > today ? 'future' : 'current';
    return { cells, from, to, era };
  }, [anchor, today]);

  return (
    <View>
      <ChipRow
        items={[
          { key: 'today', label: 'Hoje' },
          { key: 'yesterday', label: 'Ontem' },
          {
            key: 'other',
            label: isOther ? format(parseDay(date), "d 'de' MMM", { locale: ptBR }) : 'Escolher data',
          },
        ]}
        selected={date === today ? 'today' : date === yesterday ? 'yesterday' : 'other'}
        onPick={(key) => {
          if (key === 'today') pick(today);
          else if (key === 'yesterday') pick(yesterday);
          else {
            setAnchor(dayKey(startOfMonth(parseDay(date))));
            setOpen((o) => !o);
          }
        }}
      />

      {open ? (
        <Animated.View entering={FadeIn.duration(duration.state)} style={styles.dateGrid}>
          <MonthStepper anchor={anchor} today={today} era={grid.era} min={min} max={today} onChange={setAnchor} />

          <View style={styles.weekdays} accessibilityElementsHidden>
            {WEEKDAYS.map((d) => (
              <Txt key={d} variant="micro" t="faint" style={styles.weekday}>
                {d}
              </Txt>
            ))}
          </View>

          {/*
            Two kinds of cell that are not choices, drawn two different ways (LANC-08). A day of the
            neighbouring month is not part of this month at all, so it is left empty — it used to be
            hidden with an opacity the press animation overwrote, and 28-30 de setembro rendered
            exactly like the disabled days after today. A future day of this month *is* this month,
            just not yet; it stays, faint and struck through, so the grid still reads as a calendar.
          */}
          <View style={styles.dayGrid}>
            {grid.cells.map((cell) => {
              const inMonth = cell >= grid.from && cell <= grid.to;
              if (!inMonth) return <View key={cell} style={styles.dayHit} />;
              const future = cell > today;
              const current = cell === date;
              return (
                <Press
                  key={cell}
                  onPress={() => pick(cell)}
                  disabled={future}
                  haptic="light"
                  scale={0.96}
                  dim={0.7}
                  outerStyle={styles.dayHit}
                  style={[styles.day, current ? styles.daySelected : null]}
                  accessibilityLabel={format(parseDay(cell), "d 'de' MMMM", { locale: ptBR })}
                  accessibilityState={{ selected: current, disabled: future }}
                >
                  <Txt
                    variant="label"
                    f={current ? 'monoMedium' : 'mono'}
                    t={current ? 'onInk' : future ? 'faint' : 'ink'}
                    tabular
                    style={future ? styles.dayFuture : null}
                  >
                    {format(parseDay(cell), 'd')}
                  </Txt>
                </Press>
              );
            })}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;

function Keypad({
  onDigit,
  onPair,
  onDrop,
}: {
  onDigit: (d: number) => void;
  onPair: () => void;
  onDrop: () => void;
}) {
  return (
    <View style={styles.keypad}>
      {KEYS.map((k) => (
        <Press
          key={k}
          onPress={() => (k === 'del' ? onDrop() : k === '00' ? onPair() : onDigit(Number(k)))}
          haptic="light"
          scale={0.94}
          dim={0.6}
          hitSlop={0}
          outerStyle={styles.keyHit}
          style={styles.key}
          accessibilityLabel={k === 'del' ? 'Tirar o último dígito' : k}
        >
          {k === 'del' ? (
            <Backspace />
          ) : (
            <Txt variant="title" f="monoMedium" t="ink" tabular center>
              {k}
            </Txt>
          )}
        </Press>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  settleNote: { paddingTop: space.xs },
  // Same geometry `calendario` reads a month in, at the scale a form section gets rather than a
  // whole screen — one grammar for "pick a day" wherever the app asks it.
  dateGrid: { paddingTop: space.sm },
  weekdays: { flexDirection: 'row', paddingTop: space.sm },
  weekday: { flex: 1, textAlign: 'center', letterSpacing: 0.35 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: space.xs },
  dayHit: { width: '14.2857%' },
  day: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  daySelected: { backgroundColor: color.ink, borderRadius: radius.md },
  dayFuture: { textDecorationLine: 'line-through', opacity: 0.6 },
  capWarn: { paddingTop: space.md },
  // The warning hangs off a rule of its own so it reads as a consequence of the choice above it
  // rather than as a caption belonging to the chip row.
  capWarnRule: {
    height: 1,
    width: 28,
    marginBottom: space.sm,
    backgroundColor: color.negative,
    opacity: 0.6,
  },
  /* The scroll spans the panel edge to edge and pads its content back to the gutter. A vertical
     ScrollView clips to its own bounds, so a gutter-wide one cut every chip row at the gutter no
     matter how far the row itself bled; this is what lets them run on into the curve. */
  flex: { flex: 1, marginHorizontal: -space.gutter },
  scroll: { paddingTop: space.md, paddingBottom: space.lg, paddingHorizontal: space.gutter, flexGrow: 1 },

  segmented: { flexDirection: 'row' },
  /* Half the row belongs to the touch target; the label only centres itself inside it. */
  segmentHit: { flex: 1 },
  segment: { justifyContent: 'flex-end', paddingBottom: space.sm },
  segmentRule: {
    height: 2,
    marginTop: space.sm,
    backgroundColor: color.hairline,
  },

  readoutBlock: { flexGrow: 1, justifyContent: 'center' },
  readout: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: space.xl },
  symbol: { paddingRight: 4, paddingBottom: 6 },
  decimals: { paddingLeft: 1, paddingBottom: 6 },

  groupLabel: { letterSpacing: 0.8, paddingTop: space.xl, paddingBottom: space.md },
  accountNote: { paddingTop: space.md },

  editSub: { paddingTop: space.xs, paddingBottom: space.lg },

  summary: { flexDirection: 'row' },
  summaryGap: { width: space.lg },
  summaryCell: { flex: 1, minHeight: 64, justifyContent: 'flex-end' },
  summaryLabel: { letterSpacing: 0.8 },
  summaryValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  shrink: { flexShrink: 1 },
  /* The same rule-as-selection the segmented control draws, at hairline weight until it is open. */
  summaryRule: { height: 1, backgroundColor: color.hairline },
  summaryRuleOn: { height: 2, marginTop: -1, backgroundColor: color.ink },
  pickerRow: { paddingTop: space.md },

  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  /* The third of the row is the key itself. Written on the inner view it sized the glyph inside a
     target that had already shrunk to the glyph, so twelve keys never wrapped into four rows — they
     queued up in one crushed line. */
  keyHit: { width: '33.333%' },
  key: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },

  submit: { paddingTop: space.lg, paddingBottom: space.sm },
  remove: { paddingTop: space.lg },
});
