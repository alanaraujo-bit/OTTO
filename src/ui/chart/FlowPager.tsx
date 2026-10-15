import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { ease, duration, spring, useReducedMotion } from '@/theme/motion';
import type { Cents } from '@/domain/money';
import { Press } from '../Press';
import { CategoryDonut, type DonutSlice } from './CategoryDonut';

export interface FlowPage {
  key: string;
  /** The tab name, set in micro caps above the ring. */
  label: string;
  slices: DonutSlice[];
  total: Cents;
  /** What to say when this page has nothing to draw. */
  empty: string;
  onSelect?: (category: string) => void;
}

interface TabBox {
  x: number;
  w: number;
}

/**
 * Two rings that trade places under the finger: spending and income.
 *
 * Each page is a full `CategoryDonut`, so the ring and its names belong to the page and not to the
 * pager. A horizontal drag moves the track with the finger; release past a quarter of the width, or
 * with enough velocity, carries it to the next page on a spring. A drag that starts from the first or
 * last page meets a light resistance rather than a hard stop, so the edge reads as an edge.
 *
 * The header tabs do the same job for a finger that only taps. Both paths move one shared value, so
 * the track, the underline and the page that is drawn always agree.
 *
 * The underline is measured against each tab's own label, so it sits under the word and not under an
 * arbitrary half of the row. Between the tabs there is room for the eye to tell them apart.
 *
 * The gesture only claims a clearly horizontal drag (`activeOffsetX`, `failOffsetY`), so the screen
 * still scrolls vertically without a fight.
 */
export function FlowPager({
  pages,
  centerLabel,
  delay = 0,
}: {
  pages: FlowPage[];
  /** The line under the total, the same for every page — the period the figures cover. */
  centerLabel: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [tabs, setTabs] = useState<(TabBox | undefined)[]>([]);

  // `base` is the page, as a number from 0 to the last page. `drag` is the finger's offset, in pixels,
  // on top of it. The track is at `-base * width + drag`, so a gesture and a tap are the same motion.
  const base = useSharedValue(0);
  const drag = useSharedValue(0);
  const w = useSharedValue(0);
  const last = pages.length - 1;

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -base.value * w.value + drag.value }],
  }));

  // Where each tab sits, as a function of the page. Until every tab has been measured the rule stays
  // hidden rather than guessing a position.
  const measured = pages.every((_, i) => tabs[i] !== undefined);
  const steps = pages.map((_, i) => i);
  const xs = pages.map((_, i) => tabs[i]?.x ?? 0);
  const ws = pages.map((_, i) => tabs[i]?.w ?? 0);

  const ruleStyle = useAnimatedStyle(() => {
    if (!measured) return { width: 0 };
    return {
      width: interpolate(base.value, steps, ws),
      transform: [{ translateX: interpolate(base.value, steps, xs) }],
    };
  });

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      'worklet';
      const atEdge = (base.value === 0 && e.translationX > 0) || (base.value === last && e.translationX < 0);
      drag.value = atEdge ? e.translationX * 0.3 : e.translationX;
    })
    .onEnd((e) => {
      'worklet';
      const W = w.value;
      let next = base.value;
      if ((e.translationX < -W * 0.25 || e.velocityX < -500) && base.value < last) next = base.value + 1;
      else if ((e.translationX > W * 0.25 || e.velocityX > 500) && base.value > 0) next = base.value - 1;
      glide(base, next, reduced);
      glide(drag, 0, reduced);
      runOnJS(setIndex)(next);
    });

  const onLayout = (e: LayoutChangeEvent) => {
    const v = e.nativeEvent.layout.width;
    w.value = v;
    setWidth(v);
  };

  const onTabLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width: tw } = e.nativeEvent.layout;
    setTabs((prev) => {
      const cur = prev[i];
      if (cur && cur.x === x && cur.w === tw) return prev;
      const next = prev.slice();
      next[i] = { x, w: tw };
      return next;
    });
  };

  const goTo = (i: number) => {
    setIndex(i);
    glide(base, i, reduced);
  };

  return (
    <View>
      <View style={styles.head}>
        {pages.map((p, i) => (
          <View key={p.key} onLayout={onTabLayout(i)}>
            <Press onPress={() => goTo(i)} style={styles.tab} haptic="none" accessibilityLabel={p.label}>
              <Txt variant="micro" t={i === index ? 'ink' : 'faint'}>
                {p.label.toLocaleUpperCase('pt-BR')}
              </Txt>
            </Press>
          </View>
        ))}
        <Animated.View style={[styles.rule, ruleStyle]} pointerEvents="none" />
      </View>

      <GestureDetector gesture={pan}>
        <View style={styles.viewport} onLayout={onLayout}>
          <Animated.View style={[styles.track, { width: width * pages.length }, trackStyle]}>
            {pages.map((p, i) => (
              <View key={p.key} style={{ width }}>
                {p.slices.length > 0 ? (
                  <CategoryDonut
                    slices={p.slices}
                    total={p.total}
                    label={centerLabel}
                    delay={delay}
                    onSelect={p.onSelect}
                    active={i === index}
                  />
                ) : (
                  <View style={styles.empty}>
                    <Txt variant="body" t="muted">
                      {p.empty}
                    </Txt>
                  </View>
                )}
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

/**
 * Moves a value to `to` on the UI thread, with the app's spring, or a plain fade-length slide when
 * the system asks for less motion. Written as a worklet so the gesture and the header tabs share it.
 */
function glide(v: SharedValue<number>, to: number, reduced: boolean) {
  'worklet';
  v.value = reduced
    ? withTiming(to, { duration: duration.state, easing: ease.standard })
    : withSpring(to, spring.crisp);
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: space.lg, marginBottom: space.md },
  tab: { paddingBottom: space.sm },
  rule: { position: 'absolute', bottom: 0, left: 0, height: 1, backgroundColor: color.ink },
  viewport: { overflow: 'hidden' },
  track: { flexDirection: 'row' },
  empty: { minHeight: 120, justifyContent: 'center' },
});
