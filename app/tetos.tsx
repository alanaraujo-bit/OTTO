import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { MoneyField } from '@/ui/MoneyField';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Amount } from '@/ui/Amount';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useSnackbar } from '@/ui/Snackbar';
import { useLedger } from '@/state/ledger';
import { setCap } from '@/db/repo';
import { saidPlainly } from '@/lib/errors';
import { capReading, type CapReading } from '@/domain/cap';
import { dayKey } from '@/domain/projection';
import { isSpend, paymentSeries } from '@/domain/spend';
import { brlShort } from '@/domain/money';

const ENTER = { delay: 120, step: 60, cap: 8, rise: 10, shift: 22 } as const;

/**
 * Tetos: o quanto você aceita gastar, por categoria.
 *
 * **The authored idea: a ceiling is drawn as the rest of the month, not as a percentage.** Every
 * other budget app renders a bar filling up, which answers "how much have I used" — a question the
 * figure beside it already answers, and one nobody acts on. The reading that actually changes
 * behaviour is *per remaining day*: R$ 60 spread over 9 days is R$ 6,66 a day, and that is a number
 * somebody can hold in their head at the counter. So each row leads with what was spent against the
 * ceiling, and the line under it says what the month has left in it — in days and in reais per day
 * together, because either alone is half the fact.
 *
 * The category list is derived from what the owner actually spends on, never from a table they have
 * to curate first. A budget screen whose first step is "crie uma categoria" has put its own filing
 * ahead of their money.
 */
export default function Tetos() {
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

  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => dayKey(new Date()), []);

  /**
   * Every category worth offering a ceiling on, the capped ones first.
   *
   * Ordered underneath that by what the owner spends most on, because that is the order in which a
   * ceiling is worth setting at all. A capped category stays on the list even at zero spend this
   * month: it is a ceiling they chose, and hiding it the moment it is being respected would hide the
   * evidence that it is working.
   */
  const rows = useMemo(() => {
    const payments = paymentSeries(series);
    const weight = new Map<string, number>();
    for (const e of entries) {
      if (!isSpend(e, payments)) continue;
      weight.set(e.category, (weight.get(e.category) ?? 0) + e.amountCents);
    }
    for (const c of caps) if (!weight.has(c.category)) weight.set(c.category, 0);

    const capped = new Map(caps.map((c) => [c.category, c.capCents]));
    return [...weight.entries()]
      .sort((a, b) => (capped.has(b[0]) ? 1 : 0) - (capped.has(a[0]) ? 1 : 0) || b[1] - a[1])
      .map(([category]) => {
        const cents = capped.get(category);
        return {
          category,
          reading:
            cents === undefined
              ? null
              : capReading({ category, capCents: cents }, entries, series, today),
        };
      });
  }, [entries, series, caps, today]);

  const commit = async (category: string, cents: number) => {
    setSaving(true);
    try {
      await setCap(category, cents);
      await load();
      setOpen(null);
      setDraft(null);
      snack(
        cents > 0 ? `Teto de ${brlShort(cents)} em ${category}.` : `Teto removido de ${category}.`,
        'info',
      );
    } catch (e) {
      snack(saidPlainly(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <BackBar />
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll}>
        <Reveal index={0} {...ENTER}>
          <Txt variant="heading" f="sansSemibold">
            Tetos
          </Txt>
          <Txt variant="body" t="muted" style={styles.lede}>
            Quanto você aceita gastar num mês. OTTO fica calado enquanto o teto aguenta, e avisa
            quando o ritmo não leva ele até o fim do mês.
          </Txt>
        </Reveal>

        {!ready && !error ? (
          <Reveal index={1} {...ENTER}>
            <Txt variant="body" t="faint" style={styles.notice}>
              lendo seu razão
            </Txt>
          </Reveal>
        ) : null}

        {ready && !error && rows.length === 0 ? (
          <Reveal index={1} {...ENTER}>
            <Txt variant="body" t="faint" style={styles.notice}>
              Ainda não há gasto nenhum para limitar. Lance alguma coisa e suas categorias aparecem
              aqui.
            </Txt>
          </Reveal>
        ) : null}

        {rows.map((row, i) => (
          <Reveal key={row.category} index={Math.min(i + 1, ENTER.cap)} {...ENTER}>
            <Row
              category={row.category}
              reading={row.reading}
              open={open === row.category}
              draft={draft}
              saving={saving}
              onOpen={() => {
                setOpen((prev) => (prev === row.category ? null : row.category));
                setDraft(row.reading?.capCents ?? null);
              }}
              onDraft={setDraft}
              onCommit={(cents) => void commit(row.category, cents)}
            />
          </Reveal>
        ))}
      </KeyboardAwareScrollView>
    </>
  );
}

function Row({
  category,
  reading,
  open,
  draft,
  saving,
  onOpen,
  onDraft,
  onCommit,
}: {
  category: string;
  reading: CapReading | null;
  open: boolean;
  draft: number | null;
  saving: boolean;
  onOpen: () => void;
  onDraft: (cents: number | null) => void;
  onCommit: (cents: number) => void;
}) {
  /*
   * What the row says when it is closed.
   *
   * Three readings, and the order matters: through the ceiling, on course to break it, or holding.
   * Only the first two are coloured — a budget that is working is not news, and it should not
   * compete for attention with one that is not.
   */
  const note = !reading
    ? 'sem teto'
    : reading.leftCents <= 0
      ? `${brlShort(-reading.leftCents)} acima do teto`
      : reading.burstsOn
        ? `no ritmo, estoura dia ${Number(reading.burstsOn.slice(8))}`
        : `${brlShort(reading.perDayCents)} por dia nos ${reading.daysLeft} dias que faltam`;

  const tone = !reading ? 'faint' : reading.leftCents <= 0 || reading.burstsOn ? 'negative' : 'muted';

  return (
    <View style={styles.row}>
      <View style={styles.rule} />
      <Press onPress={onOpen} style={styles.head} accessibilityLabel={`Teto de ${category}`}>
        <View style={styles.headText}>
          <Txt variant="body" numberOfLines={1}>
            {category}
          </Txt>
          <Txt variant="micro" t={tone} numberOfLines={1}>
            {note}
          </Txt>
        </View>
        {reading ? (
          <View style={styles.figures}>
            <Amount cents={reading.spent} size="body" tone="ink" />
            <Txt variant="micro" t="faint" tabular>
              {`de ${brlShort(reading.capCents)}`}
            </Txt>
          </View>
        ) : (
          <Txt variant="label" t="faint">
            definir
          </Txt>
        )}
      </Press>

      {open ? (
        <View style={styles.editor}>
          <MoneyField label={`Teto mensal de ${category}`} cents={draft} onChangeCents={onDraft} />
          <View style={styles.actions}>
            <Button
              label="Salvar teto"
              onPress={() => onCommit(draft ?? 0)}
              disabled={saving || (draft ?? 0) <= 0}
              loading={saving}
            />
            {reading ? (
              <Press
                onPress={() => onCommit(0)}
                style={styles.remove}
                accessibilityLabel="Remover teto"
              >
                <Txt variant="label" t="faint" center>
                  Remover teto
                </Txt>
              </Press>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: space.md, paddingBottom: space.xxl },
  lede: { paddingTop: space.sm },
  notice: { paddingTop: space.lg },
  row: { paddingTop: space.md },
  rule: { height: 1, backgroundColor: color.hairline },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  headText: { flex: 1, paddingRight: space.md },
  figures: { alignItems: 'flex-end' },
  editor: { paddingBottom: space.md },
  actions: { paddingTop: space.md },
  remove: { paddingTop: space.md },
});
