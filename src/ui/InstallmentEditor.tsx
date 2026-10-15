import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Press } from './Press';
import { MoneyField } from './MoneyField';
import { Amount } from './Amount';
import { Reveal } from './Reveal';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import { brl, type Cents } from '@/domain/money';
import { installmentCents, normalizeOverrides, sumInstallments } from '@/domain/installments';
import { parseDay } from '@/domain/projection';

interface Props {
  /** The standard amount: what every installment costs unless it has been changed. */
  base: Cents;
  total: number;
  /** Installments already paid. They are read, never edited. */
  paid: number;
  /** The day the first installment falls in; each later one is a month on from it. */
  startDate: string;
  /**
   * The overrides as typed, sparse and one-based. It may hold a zero while the owner is typing, which
   * `normalizeOverrides` discards — that is what lets the editor show the mistake instead of hiding it.
   */
  value: Record<string, Cents>;
  onChange: (next: Record<string, Cents>) => void;
}

/**
 * The installments of one debt, priced one at a time.
 *
 * **A list, not a grid of inputs.** A debt can run to 480 installments, and an input per row would
 * keep 480 keyboards' worth of state alive to show a column of numbers. The rows are read-only text.
 * Exactly one is open at a time, and only the open row carries a `MoneyField`.
 *
 * **The total is the figure that moves.** It is computed from the same normalised overrides the
 * save writes, so the number on the screen is the number that gets stored, and it is set next to what
 * the same count would cost at the standard amount — the difference is the thing the owner is
 * deciding about.
 *
 * **Out of the standard is marked in ink, not in colour.** Warning, positive and negative are for
 * money moving, and a customised installment is not moving any differently; it is only priced
 * differently. So it reads by weight and by a word.
 */
export function InstallmentEditor({ base, total, paid, startDate, value, onChange }: Props) {
  const [openN, setOpenN] = useState<number | null>(null);

  const effective = useMemo(
    () => normalizeOverrides(base, total, value) ?? {},
    [base, total, value],
  );
  const totalCents = sumInstallments(base, effective, 1, total);
  const standardCents = base * total;
  const flagged = Object.keys(effective).length;
  const zeroed = Object.entries(value).some(([key, cents]) => cents === 0 && Number(key) <= total);

  // An installment that has been removed from the count cannot stay open; deriving this rather than
  // resetting state in an effect means the panel closes on the same render the count drops.
  const open = openN !== null && openN <= total ? openN : null;

  const set = (n: number, cents: number | null) => {
    const next = { ...value };
    if (cents === null) delete next[String(n)];
    else next[String(n)] = cents;
    onChange(next);
  };

  // "Daqui para frente": the typed figure lands on this installment and every unpaid one after it.
  const applyFollowing = (n: number, cents: number) => {
    const next = { ...value, [String(n)]: cents };
    for (let k = n + 1; k <= total; k++) if (k > paid) next[String(k)] = cents;
    onChange(next);
  };

  const first = parseDay(startDate);

  return (
    <View>
      <DrawnRule />

      <View style={styles.head}>
        <Txt variant="micro" f="sansMedium" t="muted">TOTAL DAS PARCELAS</Txt>
        {flagged > 0 ? <Txt variant="micro" t="faint">{flagged} fora do padrão</Txt> : null}
      </View>
      <Amount cents={totalCents} size="heading" tone="ink" />
      <Txt variant="label" t="muted" style={styles.compare}>
        {flagged > 0
          ? `${total} × ${brl(base)} daria ${brl(standardCents)}`
          : `${total} × ${brl(base)}, todas iguais`}
      </Txt>
      {zeroed ? (
        <Txt variant="label" t="negative" style={styles.error}>
          Uma parcela não pode ser zero. Apague o valor para voltar ao padrão.
        </Txt>
      ) : null}
      {paid > 0 ? (
        <Txt variant="micro" t="faint" style={styles.lockNote}>
          As parcelas já pagas não se editam.
        </Txt>
      ) : null}

      <View style={styles.list}>
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
          const locked = n <= paid;
          const custom = effective[String(n)] !== undefined;
          const cents = installmentCents(base, effective, n);
          const isOpen = open === n;
          const month = format(addMonths(startOfMonth(first), n - 1), "MMM 'de' yyyy", { locale: ptBR });
          const tone = locked ? 'faint' : 'muted';

          return (
            <View key={n}>
              <Press
                disabled={locked}
                onPress={() => setOpenN(isOpen ? null : n)}
                style={[styles.row, isOpen ? styles.rowOpen : null]}
                accessibilityLabel={`Parcela ${n}, ${month}`}
                accessibilityState={{ selected: isOpen, disabled: locked }}
              >
                <View style={styles.rowLeft}>
                  <Txt variant="label" f="monoMedium" t={tone} tabular>
                    {String(n).padStart(2, '0')}
                  </Txt>
                  <Txt variant="label" t={tone}>{month}</Txt>
                </View>
                <View style={styles.rowRight}>
                  {locked ? (
                    <Txt variant="micro" t="faint">paga</Txt>
                  ) : custom ? (
                    <Txt variant="micro" f="sansMedium" t="ink">fora do padrão</Txt>
                  ) : null}
                  <Amount
                    cents={cents}
                    size="body"
                    tone={locked ? 'faint' : custom ? 'ink' : 'muted'}
                  />
                </View>
              </Press>

              {isOpen ? (
                <Reveal index={0} rise={6}>
                  <View style={styles.panel}>
                    <MoneyField
                      label={`Parcela ${n}`}
                      cents={value[String(n)] ?? null}
                      onChangeCents={(c) => set(n, c)}
                      placeholder={`padrão ${brl(base)}`}
                    />
                    <View style={styles.actions}>
                      {n < total && cents > 0 ? (
                        <Press onPress={() => applyFollowing(n, cents)} style={styles.action}>
                          <Txt variant="label" f="sansMedium" t="ink">aplicar às seguintes</Txt>
                        </Press>
                      ) : null}
                      {custom ? (
                        <Press onPress={() => set(n, null)} style={styles.action}>
                          <Txt variant="label" t="muted">voltar ao padrão</Txt>
                        </Press>
                      ) : null}
                      <Press onPress={() => setOpenN(null)} style={styles.action}>
                        <Txt variant="label" t="muted">fechar</Txt>
                      </Press>
                    </View>
                  </View>
                </Reveal>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The rule above the editor, drawn left to right as the panel opens.
 *
 * Every rule in OTTO is drawn this way, decelerating, so the editor arrives the way a ledger is
 * ruled before anything is written in it. It is the one authored moment of this panel. Under reduced
 * motion the rule is simply there.
 */
function DrawnRule() {
  const reduced = useReducedMotion();
  const drawn = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    drawn.value = reduced ? 1 : withTiming(1, { duration: duration.rule, easing: ease.out });
  }, [drawn, reduced]);

  const fill = useAnimatedStyle(() => ({ width: `${drawn.value * 100}%` }));

  return (
    <View style={styles.ruleTrack}>
      <Animated.View style={[styles.ruleFill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ruleTrack: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  ruleFill: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong },

  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  compare: { paddingTop: space.xs },
  error: { paddingTop: space.md },
  lockNote: { paddingTop: space.sm },

  list: { paddingTop: space.lg },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowOpen: { borderBottomColor: color.hairlineStrong, backgroundColor: color.surface },
  rowLeft: { flexDirection: 'row', alignItems: 'baseline', gap: space.md, flexShrink: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },

  panel: { paddingVertical: space.md, paddingHorizontal: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, paddingTop: space.sm },
  action: { minHeight: 48, justifyContent: 'center' },
});
