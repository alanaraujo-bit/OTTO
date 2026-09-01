import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { color, rim, space } from '@/theme/tokens';

/**
 * The app ground.
 *
 * Two jobs, both specific to the target hardware (Edge 60 Fusion, quad-curved pOLED):
 *  1. Draw the rim light — a low-alpha bleed that wraps onto the curved edge so the panel reads as
 *     lit from its rim. It sits behind everything and carries no content.
 *  2. Hold content inside the curve-safe gutter and clear of the system bars, using real window
 *     insets rather than a hardcoded offset.
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
  );
}

/**
 * Lit from the upper rim. Two stops only — a third reads as a gradient effect rather than as light.
 *
 * The SVG is sized from a measured layout instead of percentages: percentage-sized SVG does not
 * resolve reliably under react-native-web, and a light that stops short of the panel edge leaves a
 * visible seam.
 */
function RimLight() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height },
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <RadialGradient id="ottoRim" cx="50%" cy="0%" r="88%">
              <Stop offset="0" stopColor={rim.inner} />
              <Stop offset="1" stopColor={rim.outer} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#ottoRim)" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { flex: 1 },
});
