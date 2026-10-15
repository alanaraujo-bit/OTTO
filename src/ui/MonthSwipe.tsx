import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { addMonths, startOfMonth } from 'date-fns';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { dayKey, parseDay } from '@/domain/projection';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import { MonthStepper } from './MonthStepper';

/** How far the figures travel on a month change, as a share of the content width. */
const TRAVEL = 0.35;
/** The share of a drag the figures follow before the owner lets go. Slightly less than 1:1. */
const FOLLOW = 0.85;
/** Past this share of the width, a released drag becomes a month change. */
const COMMIT = 0.25;
/** Velocity, in dp per second, that commits a month change without a long drag. */
const FLING = 500;

interface Pending {
  /** +1 is a later month, -1 an earlier one. 0 means nothing is in flight. */
  dir: number;
  target: string | null;
  /** Only a swipe that lands gets the haptic. The arrows already answer with their own tick. */
  haptic: boolean;
}

const IDLE: Pending = { dir: 0, target: null, haptic: false };

/**
 * The month being read, and the drag that changes it.
 *
 * The stepper stays where it is — it is the control and the label, and it changes at once. What
 * moves is the instrument beneath it: the figure, the curve and the flows. Dragging across that area
 * carries them with the finger; letting go past a quarter of the width, or with a flick, changes the
 * month, and anything less springs back.
 *
 * The arrows and the drag share one path. Both leave the content in the direction of the change, swap
 * the month while it is invisible, and enter from the other side. So the arrows and the swipe read as
 * the same movement, and "voltar para hoje" reads as a move in the direction it actually travels.
 *
 * The detector is the content column, inside the gutter. It does not reach the screen edge, where the
 * system Back gesture lives, and it only claims a clearly horizontal drag, so the page still scrolls
 * vertically and the flow pager further down still owns its own swipe.
 *
 * At the first and last month the drag meets a rubber band and returns. Under reduced motion nothing
 * follows the finger and nothing travels; the change becomes a plain fade, and a committed swipe still
 * changes the month.
 */
export function MonthSwipe({
  anchor,
  today,
  era,
  min,
  max,
  onChange,
  children,
}: {
  anchor: string;
  today: string;
  era: 'past' | 'current' | 'future';
  min: string;
  max: string;
  onChange: (anchor: string) => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  const a = startOfMonth(parseDay(anchor));
  const prev = dayKey(addMonths(a, -1));
  const next = dayKey(addMonths(a, 1));
  const canPrev = prev >= min;
  const canNext = next <= max;

  // The worklets read these on the UI thread; the JS side reads the latest props through a ref.
  const canPrevSV = useSharedValue(canPrev);
  const canNextSV = useSharedValue(canNext);
  const reducedSV = useSharedValue(reduced);
  useEffect(() => {
    canPrevSV.value = canPrev;
    canNextSV.value = canNext;
    reducedSV.value = reduced;
  }, [canPrev, canNext, reduced, canPrevSV, canNextSV, reducedSV]);

  const latest = useRef({ anchor, prev, next, onChange });
  latest.current = { anchor, prev, next, onChange };

  const pending = useRef<Pending>(IDLE);

  const width = useSharedValue(0);
  /** Horizontal offset of the instrument. */
  const x = useSharedValue(0);
  /** Opacity of the instrument. Dropped to zero across the swap so the cut is never seen. */
  const fade = useSharedValue(1);
  /** True from the first frame of a month change until the new one has settled. */
  const busy = useSharedValue(false);

  // Runs on the JS thread once the old month has left. Hands the new month to the ledger; the layout
  // effect below brings the instrument back in, once the new figures have been laid out.
  const land = useCallback((dir: number) => {
    const p = pending.current;
    const cur = latest.current.anchor;
    if (!p.target || p.target === cur) {
      pending.current = IDLE;
      runOnUI(enter)(dir);
      return;
    }
    if (p.haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    latest.current.onChange(p.target);
  }, []);

  // A swipe decides its target on the UI thread, so the JS side records the target before it leaves.
  const prepare = useCallback((dir: number, haptic: boolean) => {
    const { prev: p, next: n } = latest.current;
    pending.current = { dir, target: dir > 0 ? n : p, haptic };
  }, []);

  const leave = useCallback(
    (dir: number) => {
      'worklet';
      busy.value = true;
      if (!reducedSV.value) {
        x.value = withTiming(-dir * width.value * TRAVEL, {
          duration: duration.state,
          easing: ease.standard,
        });
      }
      fade.value = withTiming(0, { duration: duration.state, easing: ease.standard }, (fin) => {
        if (fin) runOnJS(land)(dir);
      });
    },
    [busy, reducedSV, x, width, fade, land],
  );

  const enter = useCallback(
    (dir: number) => {
      'worklet';
      if (!reducedSV.value) {
        x.value = dir * width.value * TRAVEL;
        x.value = withSpring(0, spring.crisp);
      }
      fade.value = 0;
      fade.value = withTiming(1, { duration: duration.state, easing: ease.out }, (fin) => {
        if (fin) busy.value = false;
      });
    },
    [busy, reducedSV, x, width, fade],
  );

  // The arrows and the "voltar para hoje" label come through here. The month is only changed once the
  // old figures have left, so a double tap cannot start a second change over the first.
  const move = useCallback(
    (target: string) => {
      const cur = latest.current.anchor;
      if (target === cur || busy.value) return;
      const dir = target > cur ? 1 : -1;
      pending.current = { dir, target, haptic: false };
      runOnUI(leave)(dir);
    },
    [busy, leave],
  );

  // The new month has been handed up and is now rendered: bring the figures in from the side they
  // left toward, which is the side the owner is moving toward.
  useLayoutEffect(() => {
    const dir = pending.current.dir;
    if (dir === 0) return;
    pending.current = IDLE;
    enter(dir);
    // `enter` is stable; only a changed anchor means the new month has been rendered.
  }, [anchor, enter]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          'worklet';
          // Under reduced motion nothing follows the finger; the release still decides the change.
          if (busy.value || reducedSV.value) return;
          const d = e.translationX;
          const edge = width.value * TRAVEL;
          const open = d < 0 ? canNextSV.value : canPrevSV.value;
          // Past the first or last month the figures pull against a rubber band that stiffens as it
          // is stretched, instead of sliding freely into nothing.
          x.value = open
            ? d * FOLLOW
            : Math.sign(d) * edge * (1 - 1 / (1 + (Math.abs(d) * 0.5) / edge));
        })
        .onEnd((e) => {
          'worklet';
          if (busy.value) return;
          const W = width.value;
          const farL = e.translationX < -W * COMMIT;
          const farR = e.translationX > W * COMMIT;
          const flingL = e.velocityX < -FLING;
          const flingR = e.velocityX > FLING;

          // A flick decides on its own. A long drag decides too, unless the release is moving the
          // other way, which means the owner changed their mind and it springs back.
          let dir = 0;
          if (flingL && !farR) dir = 1;
          else if (flingR && !farL) dir = -1;
          else if (farL && !flingR) dir = 1;
          else if (farR && !flingL) dir = -1;

          const allowed = dir > 0 ? canNextSV.value : canPrevSV.value;
          if (dir !== 0 && allowed) {
            runOnJS(prepare)(dir, true);
            leave(dir);
          } else {
            x.value = withSpring(0, spring.crisp);
          }
        })
        // A gesture that ends without committing (a scroll took the touch, or the system cancelled it)
        // never reaches onEnd's spring-back. `leave` sets `busy` synchronously, so a committed change is
        // recognised here and left alone; anything else returns the figures to rest.
        .onFinalize(() => {
          'worklet';
          if (!busy.value) x.value = withSpring(0, spring.crisp);
        }),
    [busy, reducedSV, width, x, canNextSV, canPrevSV, prepare, leave],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
  };

  const figures = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: x.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={styles.area} onLayout={onLayout}>
        <MonthStepper
          anchor={anchor}
          today={today}
          era={era}
          min={min}
          max={max}
          onChange={move}
        />
        <Animated.View style={figures}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  /* The column is the content width and clips what travels past it, so nothing is drawn over the
     gutter or the screen edge. */
  area: { overflow: 'hidden' },
});
