import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import Animated, { type SharedValue,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { Amount } from '../Amount';
import { Press } from '../Press';
import { CategoryIcon } from '../CategoryIcon';
import { categoryHue, color, space, type CategoryHue } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import type { CategoryIconName } from '@/domain/category';
import type { Cents } from '@/domain/money';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 208;
const STROKE = 26;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
/** 2px of ground between segments, expressed as the fraction of the ring it occupies. */
const GAP = 2 / CIRC;

export interface DonutSlice {
  category: string;
  icon: CategoryIconName;
  hue: CategoryHue;
  cents: Cents;
  /** The ceiling, or null when this category has none. */
  capCents: Cents | null;
  /** True for the aggregated remainder. It is not an identity, so it is not given a hue. */
  isRest?: boolean;
}

/**
 * The month's spending, drawn as one ring.
 *
 * **The authored idea: the ceiling is a notch, and a notch only exists where one was crossed.**
 *
 * A pie tells you composition and stops. What the owner cannot work out from composition is whether
 * any of those slices went past what they said it could be — and that is the reading worth drawing,
 * because it is the only one that changes what they do next. So each arc is the category's share of
 * the month, and where a ceiling was broken the arc carries a cut at the exact angle it broke: hue
 * up to the notch, `negative` past it. The overflow is drawn to scale, so a category R$ 10 over and
 * one R$ 400 over do not look alike.
 *
 * A ceiling that is holding draws nothing at all. `alerts.ts` states the rule this obeys — OTTO only
 * speaks when it knows something the owner does not — and "your budget is fine" is not that. The
 * consequence is that every notch on this ring is worth looking at, which is precisely what makes
 * the ring worth looking at.
 *
 * `negative` here is not decoration and not a category colour: DESIGN.md reserves it for money going
 * out and overdue, and spending past a ceiling you set is exactly that. It is also why the category
 * palette holds no red — so this one red always means the same thing.
 *
 * **Motion.** The ring rules itself clockwise from twelve, one continuous sweep rather than each
 * arc appearing at once. `motion.ts` names that thesis: every rule in this app is drawn in one
 * direction, decelerating, and a ring is that rule in polar form. Segments do not animate
 * individually — a single sweep passes through them, which is why the gaps read as gaps in one line
 * instead of as six things arriving.
 */
export function CategoryDonut({
  slices,
  total,
  label,
  delay = 0,
  onSelect,
}: {
  slices: DonutSlice[];
  total: Cents;
  /** What the figure in the middle is — "gastos do mês", "últimos 30 dias". */
  label: string;
  delay?: number;
  onSelect?: (category: string) => void;
}) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      sweep.value = 1;
      return;
    }
    sweep.value = withDelay(delay, withTiming(1, { duration: duration.focal, easing: ease.out }));
    // The ring is data. It must arrive even if the animation layer never runs.
    const settle = setTimeout(() => {
      sweep.value = 1;
    }, delay + duration.focal + 400);
    return () => clearTimeout(settle);
  }, [reduced, delay, sweep]);

  /**
   * Geometry, resolved once.
   *
   * Every arc is expressed as a start and an end in *turns* (0–1 clockwise from twelve) rather than
   * in degrees or in pixels, so the sweep can be a single scalar compared against them on the UI
   * thread. `broke` is the turn at which a ceiling was crossed, and it is null far more often than
   * not — that is the point of it.
   */
  const arcs = useMemo(() => {
    const sum = slices.reduce((n, s) => n + s.cents, 0);
    if (sum <= 0) return [];
    let at = 0;
    return slices.map((s) => {
      const share = s.cents / sum;
      const start = at;
      at += share;
      // The gap is taken off the end of every arc, so a full ring of one category still closes.
      const end = Math.max(start, at - (slices.length > 1 ? GAP : 0));
      const over = s.capCents != null && s.cents > s.capCents;
      return {
        ...s,
        start,
        end,
        // Where the ceiling fell inside this arc: proportionally, cap of spend.
        broke: over && s.capCents ? start + (end - start) * (s.capCents / s.cents) : null,
      };
    });
  }, [slices]);

  const empty = arcs.length === 0;

  return (
    <View>
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE}>
          {/* Rotated so the sweep starts at twelve rather than at three. */}
          <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
            {/* The track is the ordinary hairline, the same one every group boundary uses. */}
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              stroke={color.hairline}
              strokeWidth={empty ? 2 : STROKE}
              fill="none"
              opacity={empty ? 1 : 0.5}
            />

            {arcs.map((a) => (
              <Arc key={a.category} arc={a} sweep={sweep} />
            ))}
          </G>
        </Svg>

        {/* The dominant numeral, in the slot DESIGN.md reserves for it on every screen. */}
        <View style={styles.center} pointerEvents="none">
          <Amount cents={total} size="hero" tone="ink" />
          <Txt variant="micro" t="faint" style={styles.centerLabel}>
            {label.toLocaleUpperCase('pt-BR')}
          </Txt>
        </View>
      </View>

      <View style={styles.legend}>
        {arcs.map((a) => (
          <LegendRow key={a.category} slice={a} onSelect={onSelect} />
        ))}
      </View>
    </View>
  );
}

/**
 * One arc, in up to three marks: the spend, the overflow, and the cut between them.
 *
 * Drawn with dash geometry rather than a path, because a stroked circle keeps its round caps and its
 * width without any of the arc-flag arithmetic an SVG path arc needs — and because the dash offset
 * is a single number, which is what lets the whole ring animate off one shared value.
 */
function Arc({
  arc,
  sweep,
}: {
  arc: DonutSlice & { start: number; end: number; broke: number | null };
  sweep: SharedValue<number>;
}) {
  const tint = arc.isRest ? color.inkFaint : (categoryHue[arc.hue] ?? color.inkFaint);
  // Where the hue stops: at the notch when there is one, at the end of the arc otherwise.
  const hueEnd = arc.broke ?? arc.end;

  const hueProps = useAnimatedProps(() => {
    const len = Math.max(0, Math.min(sweep.value, hueEnd) - arc.start) * CIRC;
    return { strokeDasharray: [len, CIRC - len], strokeDashoffset: -arc.start * CIRC };
  });

  const overProps = useAnimatedProps(() => {
    if (arc.broke == null) return { strokeDasharray: [0, CIRC], strokeDashoffset: 0 };
    const len = Math.max(0, Math.min(sweep.value, arc.end) - arc.broke) * CIRC;
    return { strokeDasharray: [len, CIRC - len], strokeDashoffset: -arc.broke * CIRC };
  });

  const notch = arc.broke;
  const angle = notch == null ? 0 : notch * 2 * Math.PI;
  const cx = SIZE / 2;

  return (
    <>
      <AnimatedCircle
        cx={cx}
        cy={cx}
        r={R}
        stroke={tint}
        strokeWidth={STROKE}
        fill="none"
        animatedProps={hueProps}
      />
      {notch != null && (
        <>
          <AnimatedCircle
            cx={cx}
            cy={cx}
            r={R}
            stroke={color.negative}
            strokeWidth={STROKE}
            fill="none"
            animatedProps={overProps}
          />
          {/*
            The cut. Ground-coloured and 2px, so it reads as the ring being interrupted rather than
            as a seventh mark added on top — the same "two states of one element" move `RuleBars`
            makes with its track.
          */}
          <Line
            x1={cx + (R - STROKE / 2) * Math.cos(angle)}
            y1={cx + (R - STROKE / 2) * Math.sin(angle)}
            x2={cx + (R + STROKE / 2) * Math.cos(angle)}
            y2={cx + (R + STROKE / 2) * Math.sin(angle)}
            stroke={color.bg}
            strokeWidth={2}
          />
        </>
      )}
    </>
  );
}

/**
 * The legend, which is not optional.
 *
 * Colour is never the only carrier of identity here: every row states the name, and the glyph
 * repeats it a second time. That is what makes a five-hue palette honest on a ring where any two
 * categories can end up beside each other.
 */
function LegendRow({
  slice,
  onSelect,
}: {
  slice: DonutSlice & { broke: number | null };
  onSelect?: (category: string) => void;
}) {
  const tint = slice.isRest ? color.inkFaint : (categoryHue[slice.hue] ?? color.inkFaint);
  const over = slice.capCents != null && slice.cents > slice.capCents;
  const pct = slice.capCents ? Math.round((slice.cents / slice.capCents) * 100) : null;

  const row = (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <CategoryIcon name={slice.icon} size={17} tint={color.inkMuted} />
      <Txt variant="body" t="ink" numberOfLines={1} style={styles.name}>
        {slice.category}
      </Txt>
      {pct != null && (
        <Txt variant="micro" t={over ? 'negative' : 'faint'} style={styles.pct}>
          {pct}% do teto
        </Txt>
      )}
      <Amount cents={slice.cents} size="body" tone="ink" />
    </View>
  );

  // "Outros" is a remainder, not a place. There is nothing to open.
  if (!onSelect || slice.isRest) return row;
  return (
    <Press onPress={() => onSelect(slice.category)} hitSlop={6}>
      {row}
    </Press>
  );
}

const styles = StyleSheet.create({
  ring: { alignSelf: 'center', width: SIZE, height: SIZE, justifyContent: 'center', alignItems: 'center' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  centerLabel: { marginTop: 2 },
  legend: { marginTop: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  dot: { width: 9, height: 9, borderRadius: 999 },
  name: { flexShrink: 1, flexGrow: 1 },
  pct: { marginRight: space.xs },
});
