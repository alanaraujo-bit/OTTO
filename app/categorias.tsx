import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { MoneyField } from '@/ui/MoneyField';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Amount } from '@/ui/Amount';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { Txt } from '@/theme/text';
import { categoryHue, categoryHues, color, radius, space, type CategoryHue as Hue } from '@/theme/tokens';
import { duration, useReducedMotion } from '@/theme/motion';
import { useSnackbar } from '@/ui/Snackbar';
import { useLedger } from '@/state/ledger';
import { setCap } from '@/db/repo';
import { renameCategory, setCategory } from '@/db/repo';
import { saidPlainly } from '@/lib/errors';
import { capReading } from '@/domain/cap';
import { format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dayKey, parseDay, spendByCategory } from '@/domain/projection';
import { paymentSeries } from '@/domain/spend';
import { brlShort } from '@/domain/money';
import {
  categoryIcons,
  categoryViews,
  type CategoryIconName,
  type CategoryView,
} from '@/domain/category';

const ENTER = { delay: 120, step: 55, cap: 8, rise: 10, shift: 22 } as const;

/**
 * Categorias: what your money is called, and what it is allowed to cost.
 *
 * **The authored idea: nothing here is a prerequisite.** Every category in this list already has a
 * name, a glyph, a colour and a place in the donut before the owner arrives — `domain/category`
 * assigns those from the name itself. So this screen is never the step between somebody and
 * recording a lançamento; it is the place they come *back* to when a category has earned an opinion.
 * That is the difference between filing and refining, and `tetos.tsx` is right that only one of them
 * belongs in front of a person's money.
 *
 * The list says so in its own structure: every row is drawn the same way whether the owner dressed
 * it or not. Nothing is marked "incomplete", because nothing is. (The rule under a dressed row used
 * to wear its colour, which spent a category hue on "somebody edited this" — the one thing DESIGN.md
 * says those hues may never carry.)
 *
 * The ceiling lives in this form too, because to the owner a teto is something a category *has*.
 * `tetos.tsx` keeps its own screen for the reading — spent, remaining, per-day, the day it breaks —
 * which is a different question from what a category is. This sets the figure; that one watches it.
 */
export default function Categorias() {
  return (
    <Screen>
      <Body />
    </Screen>
  );
}

function Body() {
  const snack = useSnackbar();
  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const load = useLedger((s) => s.load);
  const entries = useLedger((s) => s.entries);
  const series = useLedger((s) => s.series);
  const caps = useLedger((s) => s.caps);
  const categories = useLedger((s) => s.categories);

  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => dayKey(new Date()), []);

  /**
   * Every category, with what the month has done to it.
   *
   * Sorted by spend rather than alphabetically. A list of twenty names in alphabetical order is a
   * filing cabinet; the same list with the ones actually consuming money at the top is a report. A
   * category with a ceiling stays visible at zero spend, for the reason `tetos.tsx` gives: hiding a
   * budget while it is being respected hides the evidence that it works.
   */
  /*
   * The window: this month, through today.
   *
   * It used to be no window at all — every spend the ledger ever held, under no label — so a row
   * read "Transporte R$ 1.499,66" beside a Home that said R$ 694,66 and neither screen was wrong
   * about anything but the period. The month to date is the period this screen's own ceilings are
   * measured in (`capReading`), and the one Análise compares per category, so the figure beside a
   * teto is now the figure the teto is judged against. It is stated on screen, under the heading.
   */
  const monthFrom = useMemo(() => dayKey(startOfMonth(parseDay(today))), [today]);

  const rows = useMemo(() => {
    const spent = new Map<string, number>();
    for (const c of spendByCategory(entries, monthFrom, today, paymentSeries(series))) {
      const key = c.category.trim().toLocaleLowerCase('pt-BR');
      spent.set(key, (spent.get(key) ?? 0) + c.cents);
    }

    /*
     * Names only ever used for money coming in. "Renda R$ 0,00" in a list of what things cost read
     * as a category that cost nothing this month, when it is not a cost at all. Those rows say what
     * they are instead of printing a spend figure, and sit after the ones that do spend.
     */
    const direction = new Map<string, Set<string>>();
    for (const r of [...entries, ...series]) {
      const key = r.category.trim().toLocaleLowerCase('pt-BR');
      const seen = direction.get(key) ?? new Set<string>();
      seen.add(r.direction);
      direction.set(key, seen);
    }
    const income = (name: string) => {
      const seen = direction.get(name.toLocaleLowerCase('pt-BR'));
      return !!seen && seen.size === 1 && seen.has('in');
    };

    return categoryViews(categories, caps, entries, series)
      .map((view) => ({
        view,
        income: income(view.name) && view.capCents == null,
        spent: spent.get(view.name.toLocaleLowerCase('pt-BR')) ?? 0,
        reading:
          view.capCents == null
            ? null
            : capReading({ category: view.name, capCents: view.capCents }, entries, series, today),
      }))
      .sort(
        (a, b) =>
          Number(a.income) - Number(b.income) ||
          b.spent - a.spent ||
          (b.view.capCents ? 1 : 0) - (a.view.capCents ? 1 : 0) ||
          a.view.name.localeCompare(b.view.name, 'pt-BR'),
      );
  }, [categories, caps, entries, series, today, monthFrom]);

  const taken = useMemo(
    () => new Set(rows.map((r) => r.view.name.toLocaleLowerCase('pt-BR'))),
    [rows],
  );

  return (
    <>
      <BackBar />
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Reveal index={0} {...ENTER}>
          <Txt variant="heading" f="sansSemibold">
            Categorias
          </Txt>
          <Txt variant="body" t="muted" style={styles.lede}>
            Elas nascem sozinhas do que você lança, já com ícone e cor. Aqui você troca o que quiser
            e diz quanto cada uma pode custar num mês.
          </Txt>
          <Txt variant="micro" t="faint" style={styles.period}>
            {`Valores: o que saiu em ${format(parseDay(today), 'MMMM', { locale: ptBR })} até hoje.`}
          </Txt>
        </Reveal>

        {!ready && !error ? (
          <Reveal index={1} {...ENTER}>
            <Txt variant="body" t="faint" style={styles.notice}>
              lendo seu razão
            </Txt>
          </Reveal>
        ) : null}

        {error ? (
          <Reveal index={1} {...ENTER}>
            <Txt variant="body" t="negative" style={styles.notice}>
              {error}
            </Txt>
          </Reveal>
        ) : null}

        {ready && !error ? (
          <Reveal index={1} {...ENTER}>
            {creating ? (
              <Editor
                key="nova"
                initial={null}
                taken={taken}
                onDone={async (message) => {
                  setCreating(false);
                  await load();
                  if (message) snack(message, 'info');
                }}
                onCancel={() => setCreating(false)}
                onError={(e) => snack(saidPlainly(e), 'error')}
              />
            ) : (
              /* Worded and drawn like "+ Nova conta ou cartão" and "+ Nova recorrência": one way to
                 add a thing, everywhere. */
              <Press
                onPress={() => setCreating(true)}
                style={styles.new}
                accessibilityLabel="Nova categoria"
              >
                <Txt variant="body" t="ink">
                  + Nova categoria
                </Txt>
              </Press>
            )}
          </Reveal>
        ) : null}

        {rows.map((row, i) => (
          <Reveal key={row.view.name} index={Math.min(i + 2, ENTER.cap)} {...ENTER}>
            {open === row.view.name ? (
              <Editor
                initial={row.view}
                taken={taken}
                onDone={async (message) => {
                  setOpen(null);
                  await load();
                  if (message) snack(message, 'info');
                }}
                onCancel={() => setOpen(null)}
                onError={(e) => snack(saidPlainly(e), 'error')}
              />
            ) : (
              <Row
                view={row.view}
                spent={row.spent}
                income={row.income}
                burstsOn={row.reading?.burstsOn ?? null}
                onPress={() => setOpen(row.view.name)}
              />
            )}
          </Reveal>
        ))}
      </KeyboardAwareScrollView>
    </>
  );
}

/**
 * One category at rest.
 *
 * The rule under the row is the colour when the owner chose it and the ordinary hairline when they
 * did not — which is how this list shows what has been authored without labelling anything as
 * missing. It is the same move `RuleBars` makes: the line that was already there does one more job.
 */
function Row({
  view,
  spent,
  income,
  burstsOn,
  onPress,
}: {
  view: CategoryView;
  spent: number;
  income: boolean;
  burstsOn: string | null;
  onPress: () => void;
}) {
  const tint = categoryHue[view.hue] ?? color.inkFaint;
  const over = view.capCents != null && spent > view.capCents;

  return (
    <Press onPress={onPress} style={styles.row} accessibilityLabel={`Editar ${view.name}`}>
      <View style={styles.rowHead}>
        <CategoryIcon name={view.icon} size={20} tint={tint} />
        <View style={styles.rowText}>
          <Txt variant="body" t="ink" numberOfLines={1}>
            {view.name}
          </Txt>
          {view.capCents != null ? (
            <Txt variant="micro" t={over ? 'negative' : 'faint'}>
              {over
                ? `passou do teto de ${brlShort(view.capCents)}`
                : burstsOn
                  ? `teto de ${brlShort(view.capCents)} · no ritmo, passa do teto dia ${Number(burstsOn.slice(8))}`
                  : `teto de ${brlShort(view.capCents)}`}
            </Txt>
          ) : income ? (
            <Txt variant="micro" t="faint" numberOfLines={1}>
              {view.description ? `entrada · ${view.description}` : 'entrada, não conta como gasto'}
            </Txt>
          ) : view.description ? (
            <Txt variant="micro" t="faint" numberOfLines={1}>
              {view.description}
            </Txt>
          ) : null}
        </View>
        {income ? null : <Amount cents={spent} size="body" tone={spent > 0 ? 'ink' : 'faint'} />}
      </View>
      <View style={styles.rowRule} />
    </Press>
  );
}

/**
 * The editor, in place.
 *
 * DESIGN.md asks for a container transform when a row expands into detail rather than a modal, and
 * the reason holds here: the list is the context. Seeing "Alimentação" open between the two
 * categories it sits between is what tells the owner which colours are already spoken for.
 */
function Editor({
  initial,
  taken,
  onDone,
  onCancel,
  onError,
}: {
  initial: CategoryView | null;
  taken: Set<string>;
  onDone: (message: string | null) => Promise<void>;
  onCancel: () => void;
  onError: (e: unknown) => void;
}) {
  const reduced = useReducedMotion();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState<CategoryIconName>(initial?.icon ?? 'tag');
  const [hue, setHue] = useState<Hue>(initial?.hue ?? 'teal');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [capCents, setCapCents] = useState<number | null>(initial?.capCents ?? null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const clash =
    trimmed.length > 0 &&
    trimmed.toLocaleLowerCase('pt-BR') !== initial?.name.toLocaleLowerCase('pt-BR') &&
    taken.has(trimmed.toLocaleLowerCase('pt-BR'));

  const commit = async () => {
    if (!trimmed || clash) return;
    setSaving(true);
    try {
      // Rename first. Every other write keys off the name, so doing it in the other order would
      // dress the old name and leave the new one bare.
      if (initial && trimmed !== initial.name) await renameCategory(initial.name, trimmed);
      await setCategory(trimmed, { icon, hue, description: description.trim() || null });
      if ((capCents ?? 0) !== (initial?.capCents ?? 0)) await setCap(trimmed, capCents ?? 0);
      await onDone(initial ? `${trimmed} atualizada.` : `${trimmed} criada.`);
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  const strip = async () => {
    if (!initial) return;
    setSaving(true);
    try {
      await setCategory(initial.name, null);
      await onDone(`${initial.name} voltou ao visual automático.`);
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(duration.state)}
      exiting={reduced ? undefined : FadeOut.duration(duration.exit)}
      style={styles.editor}
    >
      <View style={styles.editorHead}>
        <CategoryIcon name={icon} size={22} tint={categoryHue[hue] ?? color.inkFaint} />
        <Txt variant="body" t="muted">
          {initial ? 'Editando' : 'Nova categoria'}
        </Txt>
      </View>

      <Field
        label="NOME"
        value={name}
        onChangeText={setName}
        placeholder="Gastos com IA"
        autoCapitalize="sentences"
        error={clash ? 'Já existe uma categoria com esse nome.' : null}
        maxLength={40}
      />

      <Txt variant="micro" t="faint" style={styles.pickerLabel}>
        ÍCONE
      </Txt>
      <View style={styles.icons}>
        {categoryIcons.map((n) => (
          <Press key={n} onPress={() => setIcon(n)} hitSlop={4}>
            <View style={[styles.iconCell, n === icon ? styles.iconCellOn : null]}>
              <CategoryIcon name={n} size={20} tint={n === icon ? color.ink : color.inkFaint} />
            </View>
          </Press>
        ))}
      </View>

      <Txt variant="micro" t="faint" style={styles.pickerLabel}>
        COR
      </Txt>
      <View style={styles.hues}>
        {categoryHues.map((h) => (
          <Press key={h} onPress={() => setHue(h)} hitSlop={4}>
            {/* The selected swatch is ringed in ink rather than enlarged, so the row never reflows
                while somebody is comparing two colours against each other. */}
            <View style={[styles.hueCell, h === hue ? styles.hueCellOn : null]}>
              <View style={[styles.hueDot, { backgroundColor: categoryHue[h] }]} />
            </View>
          </Press>
        ))}
      </View>

      <Field
        label="DESCRIÇÃO"
        value={description}
        onChangeText={setDescription}
        placeholder="O que entra aqui"
        autoCapitalize="sentences"
        maxLength={160}
      />

      {/* No word for a placeholder: this is a figure field, set in mono, and "sem teto" was the one
          sentence on the screen typed like a number. A dash after the field's own "R$" reads as "no
          figure" rather than the "0,00" a ceiling of zero would be; the hint says what empty means. */}
      <MoneyField
        label="TETO POR MÊS"
        cents={capCents}
        onChangeCents={setCapCents}
        placeholder="—"
      />
      <Txt variant="micro" t="faint" style={styles.hint}>
        Em branco, a categoria fica sem teto. Com um teto, o OTTO fica calado enquanto ele aguenta e
        avisa quando o ritmo do mês não chega ao fim dele.
      </Txt>

      <View style={styles.actions}>
        <Button
          label={initial ? 'Salvar' : 'Criar'}
          onPress={commit}
          loading={saving}
          disabled={!trimmed || clash}
        />
        <Press onPress={onCancel} hitSlop={8} style={styles.cancel}>
          <Txt variant="body" t="muted">
            Cancelar
          </Txt>
        </Press>
        {initial?.authored ? (
          <Press onPress={strip} hitSlop={8} style={styles.cancel}>
            <Txt variant="micro" t="faint">
              Voltar ao visual automático
            </Txt>
          </Press>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // No horizontal padding: `Screen` already holds the gutter, and adding it again here put every row
  // 48dp in from the edge, twice the margin of every other screen.
  scroll: { paddingBottom: space.xxxl },
  lede: { marginTop: space.sm },
  period: { marginTop: space.sm },
  notice: { marginTop: space.xl },

  new: { minHeight: 52, marginTop: space.xl, justifyContent: 'center' },

  row: { paddingTop: space.lg },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  rowText: { flexShrink: 1, flexGrow: 1 },
  rowRule: { height: 1, marginTop: space.sm, backgroundColor: color.hairline },

  editor: { paddingTop: space.lg, paddingBottom: space.xl },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingBottom: space.md },

  pickerLabel: { marginTop: space.xl, marginBottom: space.md },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellOn: { borderColor: color.ink, backgroundColor: color.surfaceHi },

  hues: { flexDirection: 'row', gap: space.md },
  hueCell: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hueCellOn: { borderColor: color.ink },
  hueDot: { width: 26, height: 26, borderRadius: 999 },

  hint: { marginTop: space.sm },
  actions: { marginTop: space.xl, gap: space.md },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
});
