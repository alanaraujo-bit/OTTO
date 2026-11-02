import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { spring, useReducedMotion } from '@/theme/motion';
import { Txt } from '@/theme/text';
import { color, HIT, space } from '@/theme/tokens';
import { dayKey, parseDay } from '@/domain/projection';
import { ChevronLeft, ChevronRight } from './Icon';
import { Press } from './Press';

/** Where a horizontal drag across a month view leads, shared by every surface that turns it. */
export type MonthSwipe = ReturnType<typeof useMonthSwipe>;

/**
 * Turning the month with a finger, with the same feel as the saídas/entradas ring. A screen can
 * hand one swipe to the stepper and to a larger area of its own (the Home's readout and curve), so
 * the label moves under the finger wherever the drag starts. `pan()` builds a fresh gesture on each
 * call because a gesture object can only sit in one detector.
 */
export function useMonthSwipe({
  anchor,
  min,
  max,
  onChange,
}: {
  anchor: string;
  min: string;
  max: string;
  onChange: (anchor: string) => void;
}) {
  const reduced = useReducedMotion();
  /** Finger travel across the month, in px, while a drag is live. */
  const pull = useSharedValue(0);

  const a = startOfMonth(parseDay(anchor));
  const prev = dayKey(addMonths(a, -1));
  const next = dayKey(addMonths(a, 1));
  const canPrev = prev >= min;
  const canNext = next <= max;

  const step = (to: string) => {
    void Haptics.selectionAsync();
    onChange(to);
  };

  // Looser than the ring: a real thumb drifts vertically well past 10dp before it has travelled
  // 32dp sideways, and that stricter pair rejected almost every hand-made swipe. Finger to the left
  // turns the page forward.
  const pan = () =>
    Gesture.Pan()
      .activeOffsetX([-20, 20])
      .failOffsetY([-24, 24])
      .onUpdate((e) => {
        pull.value = e.translationX;
      })
      .onEnd((e) => {
        const to =
          (e.translationX < -48 || e.velocityX < -500) && canNext
            ? next
            : (e.translationX > 48 || e.velocityX > 500) && canPrev
              ? prev
              : null;
        if (to) scheduleOnRN(step, to);
      })
      // Also on a cancelled drag (the scroll took over), so the label never stays pulled aside.
      .onFinalize(() => {
        pull.value = reduced ? 0 : withSpring(0, spring.crisp);
      });

  return { pull, pan, prev, next, canPrev, canNext };
}

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
  swipe,
}: {
  /** Any day inside the month being read. */
  anchor: string;
  today: string;
  /** Decided by the ledger, never recomputed here — two modules must not disagree about a tense. */
  era: 'past' | 'current' | 'future';
  min: string;
  max: string;
  onChange: (anchor: string) => void;
  /** The screen's own swipe, when it also lets a larger area turn the month. */
  swipe?: MonthSwipe;
}) {
  const own = useMonthSwipe({ anchor, min, max, onChange });
  const { pull, pan, prev, next, canPrev, canNext } = swipe ?? own;
  const a = useMemo(() => startOfMonth(parseDay(anchor)), [anchor]);
  const t = useMemo(() => parseDay(today), [today]);

  const current = era === 'current';
  const label = format(a, "MMMM 'de' yyyy", { locale: ptBR });
  const eraLabel =
    era === 'current' ? 'mês atual' : era === 'past' ? 'mês encerrado' : 'previsto';

  // The label gives a sixth of the finger's travel, and almost nothing toward an end the data does
  // not reach, so the owner feels the wall instead of a month that never comes.
  const labelStyle = useAnimatedStyle(() => {
    const blocked = (pull.value < 0 && !canNext) || (pull.value > 0 && !canPrev);
    return { transform: [{ translateX: pull.value * (blocked ? 0.04 : 0.16) }] };
  });

  return (
    <GestureDetector gesture={pan()}>
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
          {/*
            One line each, always. At a larger font scale "mês encerrado · voltar para hoje" used to
            wrap under itself and the band grew a row taller only in the months you had navigated to,
            shoving the readout below it down. The month is written as words, so it is set in sans —
            mono is for figures.
          */}
          <Animated.View style={[styles.slide, labelStyle]}>
            <Txt variant="label" f="sansSemibold" t="ink" numberOfLines={1} style={styles.month}>
              {label.toUpperCase()}
            </Txt>
            <View style={styles.caption}>
              <Txt variant="micro" t="faint" numberOfLines={1}>
                {eraLabel}
              </Txt>
              {/* The way home only appears when there is somewhere to come back from. */}
              {!current ? (
                <Animated.View
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(120)}
                  style={styles.home}
                >
                  <Txt variant="micro" f="sansMedium" t="muted" numberOfLines={1}>
                    {'  ·  voltar para hoje'}
                  </Txt>
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>
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
    </GestureDetector>
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
  arrowHit: { width: HIT },
  arrow: { alignItems: 'center' },
  labelHit: { flex: 1 },
  label: { alignItems: 'center', paddingVertical: space.sm },
  slide: { alignItems: 'center', maxWidth: '100%' },
  month: { letterSpacing: 1.6 },
  caption: { flexDirection: 'row', alignItems: 'center', paddingTop: 1, maxWidth: '100%' },
  home: { flexShrink: 1 },
});
