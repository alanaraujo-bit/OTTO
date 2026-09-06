import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { color } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import { Txt } from '@/theme/text';
import { brlShort } from '@/domain/money';
import type { MonthCurve } from '@/domain/projection';
import { useAttention } from '../FocusSignal';

const PLOT_H = 150;
const AXIS_H = 20;
const PAD_TOP = 16;
const PAD_BOTTOM = 12;

/**
 * The month, as one line.
 *
 * This is the screen's whole argument, and the reason the home screen is not a list of numbers: the
 * elapsed half is drawn solid because it is record, the remaining half dashed because it is forecast,
 * and they are the same line on the same axis — so "where do I stand" and "where is this heading"
 * are one reading instead of two numbers the owner has to reconcile in their head.
 *
 * Every step down in the projected half is a bill. That is why there is no separate list of what is
 * due: the shape of the line *is* the list, and the list would only restate it in a worse medium.
 *
 * Dashing is doing semantic work here, not decoration — it is the one place a dashed stroke is
 * correct, because it genuinely marks projection. Which is also why the split moves with the month
 * being read: a month already closed is record end to end and is drawn entirely solid, a month still
 * ahead is forecast end to end and is drawn entirely dashed. Only the current month has a seam, and
 * only the current month gets the marker for today.
 */
export function BalanceCurve({ curve, width }: { curve: MonthCurve; width: number }) {
  const reduced = useReducedMotion();
  const attention = useAttention();

  const g = useMemo(() => geometry(curve, width), [curve, width]);

  /** 0 → 1 as the line is ruled across, left to right. */
  const draw = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      draw.value = 1;
      return;
    }
    draw.value = 0;
    draw.value = withDelay(180, withTiming(1, { duration: 820, easing: ease.out }));
    // The line must be there whether or not the animation layer is.
    const settle = setTimeout(() => {
      draw.value = 1;
    }, 1600);
    return () => clearTimeout(settle);
    // `curve.from` rather than `curve`: the month the owner is reading is what should re-rule the
    // line. Depending on the object identity would redraw on every unrelated ledger update.
  }, [reduced, draw, curve.from]);

  /**
   * OTTO watches the line being drawn.
   *
   * The mark's eyes already follow the finger and the caret; here they follow the month being ruled
   * out to its end. It costs one shared value and it is the same idea the auth screens are built on —
   * the product shows you what it is attending to.
   */
  useAnimatedReaction(
    () => draw.value,
    (v) => {
      if (!attention || reduced) return;
      // Out with the drawing head, home as it settles.
      attention.glance.value = Math.sin(v * Math.PI) * 0.9;
    },
    [attention, reduced],
  );

  const veil = useAnimatedStyle(() => ({ width: width * draw.value }));
  const endMark = useAnimatedStyle(() => ({
    opacity: Math.max(0, (draw.value - 0.88) / 0.12),
  }));

  const height = PLOT_H + AXIS_H;

  return (
    <View style={{ width, height }}>
      {/* Clipped by a container that widens, rather than by an SVG dash offset: this is a plain
          layout reveal on the UI thread, with no animated path geometry to fail on device. */}
      <Animated.View style={[styles.veil, { height }, veil]}>
        <View style={{ width, height }}>
          <Svg width={width} height={height}>
            {/* Zero is only drawn when the month actually reaches it. A zero line on a month that
                never goes near it is chrome pretending to be information. */}
            {g.zeroY != null ? (
              <Line
                x1={0}
                y1={g.zeroY}
                x2={width}
                y2={g.zeroY}
                stroke={color.negative}
                strokeWidth={1}
                strokeOpacity={0.45}
              />
            ) : null}

            {/* The drop to the month's low point, marked where it happens rather than only stated in
                words underneath. Drawn only when the month actually goes under. */}
            {g.troughX != null && g.zeroY != null ? (
              <Line
                x1={g.troughX}
                y1={g.troughY as number}
                x2={g.troughX}
                y2={g.zeroY}
                stroke={color.negative}
                strokeWidth={1}
                strokeOpacity={0.5}
                strokeDasharray="2 3"
              />
            ) : null}

            {g.areaPath ? <Path d={g.areaPath} fill={color.ink} fillOpacity={0.07} /> : null}

            {g.solidPath ? (
              <Path
                d={g.solidPath}
                stroke={color.ink}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}

            {g.dashedPath ? (
              <Path
                d={g.dashedPath}
                stroke={g.endsNegative ? color.negative : color.inkMuted}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="3 5"
                fill="none"
              />
            ) : null}

            {/* Today. The ring is the ground colour of the plot, which is the app ground — the mark
                stays legible where it sits on top of the line. Absent in any month but this one,
                because there is no "today" to point at in June or in November. */}
            {g.todayX != null ? (
              <>
                <Circle cx={g.todayX} cy={g.todayY as number} r={6.5} fill={color.bg} />
                <Circle cx={g.todayX} cy={g.todayY as number} r={4} fill={color.ink} />
              </>
            ) : null}
          </Svg>
        </View>
      </Animated.View>

      {/* The end of the month, labelled directly. One label, on the point the reader came for. */}
      <Animated.View
        style={[styles.endLabel, { left: Math.max(0, g.endX - 96), top: g.endLabelTop }, endMark]}
        pointerEvents="none"
      >
        <Txt variant="micro" t="faint" style={styles.endCaption}>
          {curve.era === 'past' ? 'fechou em' : 'fim do mês'}
        </Txt>
        <Txt variant="label" f="monoMedium" t={curve.balanceEnd < 0 ? 'negative' : 'muted'} tabular>
          {brlShort(curve.balanceEnd)}
        </Txt>
      </Animated.View>

      <View style={[styles.axis, { top: PLOT_H }]}>
        <Tick label="01" />
        <Tick label={pad(g.lastDay)} />
      </View>

      {/* "hoje" is placed under the day it names, not at the centre of the axis — a legend that
          floats away from its mark is worse than no legend. */}
      {g.todayX != null ? (
        <View
          style={[styles.todayTick, { top: PLOT_H, left: clampLabel(g.todayX, width) }]}
          pointerEvents="none"
        >
          <Tick label={`hoje ${pad(g.todayDay as number)}`} lit />
        </View>
      ) : null}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Keeps a centred label inside the plot at both extremes of the month. */
const clampLabel = (x: number, width: number) => Math.min(Math.max(x - 26, 22), width - 74);

function Tick({ label, lit = false }: { label: string; lit?: boolean }) {
  return (
    <Txt variant="micro" f="mono" t={lit ? 'muted' : 'faint'} tabular>
      {label}
    </Txt>
  );
}

interface Geometry {
  todayDay: number | null;
  lastDay: number;
  solidPath: string;
  dashedPath: string;
  areaPath: string | null;
  todayX: number | null;
  todayY: number | null;
  troughX: number | null;
  troughY: number | null;
  endX: number;
  endLabelTop: number;
  zeroY: number | null;
  endsNegative: boolean;
}

/**
 * Pure geometry, so the drawing code has no arithmetic in it.
 *
 * The vertical scale always includes zero when the month reaches it, and is padded so the line never
 * touches the frame. A curve that runs along its own top edge reads as clipped even when it is not.
 */
function geometry(curve: MonthCurve, width: number): Geometry {
  const n = curve.points.length;
  const values = curve.points.map((p) => p.balance);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);

  const top = PAD_TOP;
  const bottom = PLOT_H - PAD_BOTTOM;
  const y = (v: number) => bottom - ((v - lo) / span) * (bottom - top);
  const x = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * width);

  // Mapped once, so nothing downstream indexes back into the point list.
  const coords = curve.points.map((p, i) => ({
    x: x(i),
    y: y(p.balance),
    s: `${x(i).toFixed(2)},${y(p.balance).toFixed(2)}`,
  }));

  // Where record ends and forecast begins. A closed month is record to its last day; a month that
  // has not started is forecast from its first.
  const split =
    curve.era === 'past' ? n - 1 : curve.era === 'future' ? -1 : (curve.todayIndex ?? 0);

  const solid = split >= 0 ? coords.slice(0, split + 1).map((c) => c.s) : [];
  // The forecast starts *on* the last recorded point, so the two halves join instead of leaving a
  // gap where they meet.
  const dashed = split >= 0 ? coords.slice(split).map((c) => c.s) : coords.map((c) => c.s);

  const here = split >= 0 ? coords[split] : null;

  // The wash sits under the record only. Shading a forecast makes it look like something that
  // already happened.
  const base = y(Math.max(lo, 0));
  const areaPath =
    solid.length > 1 && here
      ? `M ${x(0).toFixed(2)},${base.toFixed(2)} L ${solid.join(' L ')} L ${here.x.toFixed(2)},${base.toFixed(2)} Z`
      : null;

  const endBalance = curve.balanceEnd;
  const endY = y(endBalance);

  const dips = curve.trough.balance < 0;
  const troughI = dips ? curve.points.findIndex((p) => p.date === curve.trough.date) : -1;
  const troughC = troughI >= 0 ? coords[troughI] : null;

  return {
    todayDay: curve.todayIndex != null ? curve.todayIndex + 1 : null,
    lastDay: n,
    solidPath: solid.length > 1 ? `M ${solid.join(' L ')}` : '',
    dashedPath: dashed.length > 1 ? `M ${dashed.join(' L ')}` : '',
    areaPath,
    todayX: curve.todayIndex != null && here ? here.x : null,
    todayY: curve.todayIndex != null && here ? here.y : null,
    troughX: troughC ? troughC.x : null,
    troughY: troughC ? troughC.y : null,
    endX: width,
    // Keep the label clear of the line: above it when there is room, below it otherwise.
    endLabelTop: endY < PLOT_H / 2 ? endY + 14 : endY - 46,
    zeroY: lo < 0 && hi > 0 ? y(0) : null,
    endsNegative: endBalance < 0,
  };
}

const styles = StyleSheet.create({
  veil: { overflow: 'hidden' },
  endLabel: { position: 'absolute', width: 96, alignItems: 'flex-end' },
  endCaption: { textAlign: 'right' },
  todayTick: { position: 'absolute', width: 52, alignItems: 'center' },
  axis: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: AXIS_H,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
