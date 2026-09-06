import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { color, rim, space } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import { FocusSignalProvider, useAttention, useFocusValue } from './FocusSignal';

/**
 * The app ground.
 *
 * Three jobs, the first two specific to the target hardware (Edge 60 Fusion, quad-curved pOLED):
 *  1. Draw the rim light — a low-alpha bleed that wraps onto the curved edge so the panel reads as
 *     lit from its rim. It sits behind everything, carries no content, and leans in when a control
 *     takes focus.
 *  2. Hold content inside the curve-safe gutter and clear of the system bars, using real window
 *     insets rather than a hardcoded offset.
 *  3. Report where the finger is, so the wordmark can look at it.
 */
export function Screen({
  children,
  gutter = true,
  bottomInset = true,
}: {
  children: ReactNode;
  gutter?: boolean;
  bottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <FocusSignalProvider>
      <TouchReporter>
        <View style={styles.root}>
          <RimLight />
          <View
            style={[
              styles.content,
              {
                paddingTop: insets.top,
                paddingBottom: bottomInset ? insets.bottom : 0,
                paddingHorizontal: gutter ? space.gutter : 0,
              },
            ]}
          >
            {children}
          </View>
        </View>
      </TouchReporter>
    </FocusSignalProvider>
  );
}

/**
 * Where the finger is, as a normalised UI-thread value.
 *
 * `Gesture.Manual` is the only detector that observes raw touches without ever competing for them:
 * it receives every touch event and stays inactive unless something calls `activate()`, which
 * nothing here does. So this sits above the entire screen and takes nothing from the buttons under
 * it — a passive observer, not a layer.
 *
 * The position is normalised here, against the measured screen, so nothing downstream has to know
 * about pixels.
 */
function TouchReporter({ children }: { children: ReactNode }) {
  const attention = useAttention();
  const w = useSharedValue(1);
  const h = useSharedValue(1);

  const gesture = useMemo(() => {
    if (!attention) return null;
    const { touching, touchX, touchY } = attention;
    const track = (x: number, y: number) => {
      'worklet';
      touchX.value = Math.min(1, Math.max(0, x / w.value));
      touchY.value = Math.min(1, Math.max(0, y / h.value));
    };
    return Gesture.Manual()
      .onTouchesDown((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        track(t.x, t.y);
        touching.value = 1;
      })
      .onTouchesMove((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (t) track(t.x, t.y);
      })
      .onTouchesUp((e) => {
        'worklet';
        if (e.numberOfTouches <= 1) touching.value = 0;
      })
      .onTouchesCancelled(() => {
        'worklet';
        touching.value = 0;
      });
  }, [attention, w, h]);

  const onLayout = (e: LayoutChangeEvent) => {
    w.value = e.nativeEvent.layout.width || 1;
    h.value = e.nativeEvent.layout.height || 1;
  };

  if (!gesture) return <>{children}</>;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.root} onLayout={onLayout}>
        {children}
      </View>
    </GestureDetector>
  );
}

/**
 * Lit from the upper rim. Two stops only — a third reads as a gradient effect rather than as light.
 *
 * The SVG is sized from a measured layout instead of percentages: percentage-sized SVG does not
 * resolve reliably under react-native-web, and a light that stops short of the panel edge leaves a
 * visible seam. Opacity is animated on the wrapper rather than on the gradient stops, so the
 * reaction costs nothing per frame.
 */
function RimLight() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const focusValue = useFocusValue();
  const reduced = useReducedMotion();

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
    );
  };

  const lean = useDerivedValue(() =>
    withTiming(focusValue ? focusValue.value : 0, {
      duration: duration.rule,
      easing: ease.out,
    }),
  );

  // A restrained warming. The light acknowledges focus; it does not put on a show.
  //
  // Intensity only — never scale. A full-bleed background that scales grows past the viewport and
  // makes the whole document horizontally scrollable, which the overflow check caught on the screen
  // whose field autofocuses.
  const animated = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : 1 + lean.value * 0.9,
  }));

  return (
    <Animated.View
      testID="otto-rim"
      style={[StyleSheet.absoluteFill, animated]}
      pointerEvents="none"
      onLayout={onLayout}
      /*
       * During a push two Screens are mounted, each rasterising a full-bleed SVG radial gradient
       * while the stack slides them. Promoting this to a hardware layer is the textbook case for it:
       * static content whose only animated property is opacity. The texture is dropped and rebuilt
       * when `size` changes, so a rotate or a keyboard resize still repaints correctly.
       */
      renderToHardwareTextureAndroid
    >
      {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <RadialGradient id="ottoRim" cx="50%" cy="0%" r="88%">
              <Stop offset="0" stopColor={rim.color} stopOpacity={rim.innerOpacity} />
              <Stop offset="1" stopColor={rim.color} stopOpacity={rim.outerOpacity} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#ottoRim)" />
        </Svg>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, overflow: 'hidden' },
  content: { flex: 1 },
});
