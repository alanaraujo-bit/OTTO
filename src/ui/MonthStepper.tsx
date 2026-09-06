import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { dayKey, parseDay } from '@/domain/projection';
import { ChevronLeft, ChevronRight } from './Icon';
import { Press } from './Press';

/**
 * The month being read, and the way through it.
 *
 * The label is the way back. Tapping the month name returns to the current one, so there is no
 * separate "hoje" button competing with the two chevrons for the same 48dp band — the control the
 * owner is already looking at is the one that undoes the navigation. The caption underneath says
 * which kind of month this is, because a figure means different things in a month that has closed
 * and one that has not started, and the screen should say which rather than let the reader infer it
 * from a dashed line.
 *
 * Both ends are bounded by real evidence: `min` is the first month the ledger has anything to say
 * about, `max` is as far as projection is honest. A chevron past either end is disabled rather than
 * hidden, so the band never changes width and the owner learns where the data stops.
 */
export function MonthStepper({
  anchor,
  today,
  era,
  min,
  max,
  onChange,
}: {
  /** Any day inside the month being read. */
  anchor: string;
  today: string;
  /** Decided by the ledger, never recomputed here — two modules must not disagree about a tense. */
  era: 'past' | 'current' | 'future';
  min: string;
  max: string;
  onChange: (anchor: string) => void;
}) {
  const a = useMemo(() => startOfMonth(parseDay(anchor)), [anchor]);
  const t = useMemo(() => parseDay(today), [today]);

  const prev = dayKey(addMonths(a, -1));
  const next = dayKey(addMonths(a, 1));

  const canPrev = prev >= min;
  const canNext = next <= max;
  const current = era === 'current';
  const label = format(a, "MMMM 'de' yyyy", { locale: ptBR });
  const eraLabel =
    era === 'current' ? 'mês atual' : era === 'past' ? 'mês encerrado' : 'previsto';

  return (
    <View style={styles.row}>
      <Press
        onPress={() => onChange(prev)}
        disabled={!canPrev}
        outerStyle={styles.arrowHit}
        style={styles.arrow}
        accessibilityLabel="Mês anterior"
      >
        <ChevronLeft tint={canPrev ? color.inkMuted : color.hairlineStrong} />
      </Press>

      <Press
        onPress={() => onChange(dayKey(t))}
        disabled={current}
        haptic="light"
        scale={0.985}
        outerStyle={styles.labelHit}
        style={styles.label}
        accessibilityLabel={
          current ? `${label}, mês atual` : `${label}. Toque para voltar ao mês atual`
        }
      >
        <Txt variant="label" f="monoMedium" t="ink" style={styles.month}>
          {label.toUpperCase()}
        </Txt>
        <View style={styles.caption}>
          <Txt variant="micro" t="faint">
            {eraLabel}
          </Txt>
          {/* The way home only appears when there is somewhere to come back from. */}
          {!current ? (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <Txt variant="micro" f="sansMedium" t="muted">
                {'  ·  voltar para hoje'}
              </Txt>
            </Animated.View>
          ) : null}
        </View>
      </Press>

      <Press
        onPress={() => onChange(next)}
        disabled={!canNext}
        outerStyle={styles.arrowHit}
        style={styles.arrow}
        accessibilityLabel="Próximo mês"
      >
        <ChevronRight tint={canNext ? color.inkMuted : color.hairlineStrong} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  /* Width and flex size the control among its siblings, so they belong on the target itself. On
     the inner view the chevrons collapsed to the glyph and the month label stopped claiming the
     middle, which pulled all three together into the centre of a band built to span the row. */
  arrowHit: { width: 44 },
  arrow: { alignItems: 'center' },
  labelHit: { flex: 1 },
  label: { alignItems: 'center', paddingVertical: space.sm },
  month: { letterSpacing: 1.6 },
  caption: { flexDirection: 'row', alignItems: 'center', paddingTop: 1 },
});
