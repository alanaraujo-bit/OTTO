import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
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
import { dayKey } from '@/domain/projection';
import { isSpend, paymentSeries } from '@/domain/spend';
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
 * The list says so in its own structure. A category the owner has dressed carries its colour on the
 * rule beneath it; one still wearing its assigned look carries the ordinary hairline. Nothing is
 * marked "incomplete", because nothing is.
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
  const rows = useMemo(() => {
    const payments = paymentSeries(series);
    const spent = new Map<string, number>();
    for (const e of entries) {
      if (!isSpend(e, payments)) continue;
      const key = e.category.trim().toLocaleLowerCase('pt-BR');
      spent.set(key, (spent.get(key) ?? 0) + e.amountCents);
    }

    return categoryViews(categories, caps, entries, series)
      .map((view) => ({
        view,
        spent: spent.get(view.name.toLocaleLowerCase('pt-BR')) ?? 0,
        reading:
          view.capCents == null
            ? null
            : capReading({ category: view.name, capCents: view.capCents }, entries, series, today),
      }))
      .sort(
        (a, b) =>
          b.spent - a.spent ||
          (b.view.capCents ? 1 : 0) - (a.view.capCents ? 1 : 0) ||
          a.view.name.localeCompare(b.view.name, 'pt-BR'),
      );
  }, [categories, caps, entries, series, today]);

  const taken = useMemo(
    () => new Set(rows.map((r) => r.view.name.toLocaleLowerCase('pt-BR'))),
    [rows],
  );

  return (
    <>
      <BackBar />
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll}>
        <Reveal index={0} {...ENTER}>
          <Txt variant="heading" f="sansSemibold">
            Categorias
          </Txt>
          <Txt variant="body" t="muted" style={styles.lede}>
            Elas nascem sozinhas do que você lança, já com ícone e cor. Aqui você troca o que quiser
            e diz quanto cada uma pode custar num mês.
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
              <Press onPress={() => setCreating(true)} style={styles.new}>
                <View style={styles.newMark}>
                  <Txt variant="body" t="muted">
                    +
                  </Txt>
                </View>
                <Txt variant="body" t="muted">
                  Criar uma categoria
                </Txt>
              </Press>
            )}
          </Reveal>
        ) : null}

        {rows.map((row, i) => (
          <Reveal key={row.view.name} index={Math.min(i + 2, ENTER.cap)} {...ENTER}>
            <Animated.View layout={LinearTransition.duration(duration.state)}>
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
                  burstsOn={row.reading?.burstsOn ?? null}
                  onPress={() => setOpen(row.view.name)}
                />
              )}
            </Animated.View>
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
  burstsOn,
  onPress,
}: {
  view: CategoryView;
  spent: number;
  burstsOn: string | null;
  onPress: () => void;
}) {
  const tint = categoryHue[view.hue] ?? color.inkFaint;
  const over = view.capCents != null && spent > view.capCents;

  return (
    <Press onPress={onPress} style={styles.row}>
      <View style={styles.rowHead}>
        <CategoryIcon name={view.icon} size={20} tint={tint} />
        <View style={styles.rowText}>
          <Txt variant="body" t="ink" numberOfLines={1}>
            {view.name}
          </Txt>
          {view.capCents != null ? (
            <Txt variant="micro" t={over ? 'negative' : 'faint'}>
              {over
                ? `passou o teto de ${brlShort(view.capCents)}`
                : burstsOn
                  ? `teto de ${brlShort(view.capCents)} · o ritmo fura dia ${burstsOn.slice(8)}`
                  : `teto de ${brlShort(view.capCents)}`}
            </Txt>
          ) : view.description ? (
            <Txt variant="micro" t="faint" numberOfLines={1}>
              {view.description}
            </Txt>
          ) : null}
        </View>
        <Amount cents={spent} size="body" tone={spent > 0 ? 'ink' : 'faint'} />
      </View>
      <View
        style={[styles.rowRule, view.authored ? { backgroundColor: tint, opacity: 0.9 } : null]}
      />
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

      <MoneyField
        label="TETO POR MÊS"
        cents={capCents}
        onChangeCents={setCapCents}
        placeholder="sem teto"
      />
      <Txt variant="micro" t="faint" style={styles.hint}>
        Com um teto, OTTO fica calado enquanto ele aguenta e avisa quando o ritmo do mês não leva ele
        até o fim.
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
  scroll: { paddingHorizontal: space.gutter, paddingBottom: space.xxxl },
  lede: { marginTop: space.sm },
  notice: { marginTop: space.xl },

  new: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, marginTop: space.xl },
  newMark: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
