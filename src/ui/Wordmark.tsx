import { useEffect } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { color } from '@/theme/tokens';

const VB_W = 388;
const VB_H = 100;
const SW = 9;
const BAR_X1 = 122;
const BAR_X2 = 266;

const ALine = Animated.createAnimatedComponent(Line);

/**
 * react-native-svg does not reliably drive SVG geometry attributes from Reanimated on web. The mark
 * must be correct without the animation layer, so the reveal is native-only and the resting geometry
 * is the finished mark — never a degenerate one.
 */
const CAN_ANIMATE_SVG = Platform.OS !== 'web';

/**
 * OTTO, drawn rather than typeset.
 *
 * The two T's share one continuous crossbar — a single uninterrupted horizontal rule through the
 * middle of the word. That rule is the same hairline that structures every screen in the app, so the
 * mark is built out of the system it fronts.
 *
 * `animate` is the auth screen's one authored moment: the crossbar is ruled across, left to right,
 * the way a line is drawn in a ledger. It is additive — the mark is complete with or without it.
 */
export function Wordmark({
  height = 34,
  stroke = color.ink,
  animate = false,
}: {
  height?: number;
  stroke?: string;
  animate?: boolean;
}) {
  const width = (VB_W / VB_H) * height;

  // Rests at the finished mark. The entrance rewinds it, it never starts broken.
  const bar = useSharedValue(1);

  useEffect(() => {
    if (!animate || !CAN_ANIMATE_SVG) return;
    bar.value = 0;
    bar.value = withDelay(
      120,
      withTiming(1, { duration: 560, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [animate, bar]);

  const barProps = useAnimatedProps(() => ({
    x2: BAR_X1 + (BAR_X2 - BAR_X1) * bar.value,
  }));

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      accessibilityRole="image"
      accessibilityLabel="OTTO"
    >
      <Circle cx={50} cy={50} r={45.5} stroke={stroke} strokeWidth={SW} fill="none" />
      <Line x1={158} y1={0} x2={158} y2={VB_H} stroke={stroke} strokeWidth={SW} />
      <Line x1={230} y1={0} x2={230} y2={VB_H} stroke={stroke} strokeWidth={SW} />
      <Circle cx={338} cy={50} r={45.5} stroke={stroke} strokeWidth={SW} fill="none" />

      <ALine
        x1={BAR_X1}
        y1={SW / 2}
        x2={BAR_X2}
        y2={SW / 2}
        animatedProps={barProps}
        stroke={stroke}
        strokeWidth={SW}
      />
    </Svg>
  );
}
