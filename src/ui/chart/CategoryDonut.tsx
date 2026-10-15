import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import Animated, { type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
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

/** The ring never grows past this, however wide the screen is. */
const MAX_SIZE = 248;
/** The figure in the middle may use this share of the hole's diameter, never more. */
const CENTER_FILL = 0.88;
/** Room reserved on each side of the ring for a name, which sits just outside its arc. */
const LABEL_W = 80;
const LABEL_LH = 14;
/** Room above and below the ring, for names of arcs at twelve and six. */
const LABEL_ROOM_Y = 18;
/** An arc shorter than this (in turns, ~25°) is too small to carry a name; the legend still lists it. */
const MIN_LABEL_SPAN = 0.07;

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
 * Every measure of the ring, derived from its diameter so the whole figure scales as one drawing.
 *
 * The stroke is a fixed share of the diameter (26 of 208, as it was authored), and the 2px of ground
 * between segments is kept at 2px whatever the size — it is a hairline, not a proportion.
 */
function geometry(size: number) {
  const stroke = size * 0.125;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return { size, stroke, r, circ, gap: circ > 0 ? 2 / circ : 0 };
}
type Geometry = ReturnType<typeof geometry>;

/**
 * The remainder is named "Outros" like any category, and a real "Outros" can sit beside it on the
 * ring. Keying by name alone would give the two the same key, so the remainder keys on its own.
 */
const sliceKey = (s: DonutSlice) => (s.isRest ? '__rest' : s.category);

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
 * **Names.** Each arc that is wide enough carries its name just outside it, at its own angle, so the
 * eye reads the colour and the word together. A name appears as the sweep reaches its arc, which
 * keeps the labels part of the same single motion rather than a set that arrives all at once.
 *
 * **Size.** The ring takes the width its column gives it, less the room the names need, up to
 * `MAX_SIZE`. Everything inside it is derived from that one measurement, and the figure in the middle
 * is fitted to the hole rather than set at a fixed size.
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
  active = true,
}: {
  slices: DonutSlice[];
  total: Cents;
  /** What the figure in the middle is — "gastos do mês", "últimos 30 dias". */
  label: string;
  delay?: number;
  onSelect?: (category: string) => void;
  /** False while the ring sits off-screen in a pager. It draws when it turns true. */
  active?: boolean;
}) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);
  // The width the column gives the frame. Zero until the first layout, so nothing is drawn at a guessed size.
  const [box, setBox] = useState(0);
  // Whether this ring has been drawn yet. The first arrival honours `delay`; every later one redraws at once.
  const drawn = useRef(false);

  useEffect(() => {
    // An inactive ring keeps its last state. It is only redrawn when it comes back into view.
    if (!active) return;
    if (reduced) {
      sweep.value = 1;
      return;
    }
    const wait = drawn.current ? 0 : delay;
    drawn.current = true;
    sweep.value = 0;
    sweep.value = withDelay(wait, withTiming(1, { duration: duration.focal, easing: ease.out }));
    // The ring is data. It must arrive even if the animation layer never runs.
    const settle = setTimeout(() => {
      sweep.value = 1;
    }, wait + duration.focal + 400);
    return () => clearTimeout(settle);
  }, [active, reduced, delay, sweep]);

  const size = Math.max(0, Math.min(Math.floor(box) - 2 * LABEL_W, MAX_SIZE));
  const g = useMemo(() => geometry(size), [size]);

  /**
   * Geometry, resolved once per size.
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
      const end = Math.max(start, at - (slices.length > 1 ? g.gap : 0));
      const over = s.capCents != null && s.cents > s.capCents;
      return {
        ...s,
        start,
        end,
        // Where the ceiling fell inside this arc: proportionally, cap of spend.
        broke: over && s.capCents ? start + (end - start) * (s.capCents / s.cents) : null,
      };
    });
  }, [slices, g.gap]);

  /**
   * Where each name sits: just outside its arc, at the arc's midpoint.
   *
   * The angle decides the anchor. A name on the right is set from its left edge and one on the left
   * from its right, so both lean away from the ring; names near twelve or six are centred on it.
   */
  const labels = useMemo(() => {
    const c = g.size / 2;
    const rl = g.r + g.stroke / 2 + 8;
    return arcs
      .filter((a) => a.cents > 0 && a.end - a.start >= MIN_LABEL_SPAN)
      .map((a) => {
        const mid = (a.start + a.end) / 2;
        const th = mid * 2 * Math.PI;
        const sx = Math.sin(th);
        const cy = Math.cos(th);
        const x = c + rl * sx;
        const y = c - rl * cy;
        const align: 'left' | 'right' | 'center' = sx > 0.35 ? 'left' : sx < -0.35 ? 'right' : 'center';
        const left = align === 'left' ? x : align === 'right' ? x - LABEL_W : x - LABEL_W / 2;
        const top = cy > 0.35 ? y - LABEL_LH : cy < -0.35 ? y : y - LABEL_LH / 2;
        return { key: sliceKey(a), name: a.category, mid, left, top, align };
      });
  }, [arcs, g]);

  const empty = arcs.length === 0;

  return (
    <View>
      <View style={styles.frame} onLayout={(e) => setBox(e.nativeEvent.layout.width)}>
        <View style={[styles.ring, { width: size, height: size }]}>
          {size > 0 && (
            <Svg width={size} height={size}>
              {/* Rotated so the sweep starts at twelve rather than at three. */}
              <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
                {/* The track is the ordinary hairline, the same one every group boundary uses. */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={g.r}
                  stroke={color.hairline}
                  strokeWidth={empty ? 2 : g.stroke}
                  fill="none"
                  opacity={empty ? 1 : 0.5}
                />

                {arcs.map((a) => (
                  <Arc key={sliceKey(a)} arc={a} g={g} sweep={sweep} />
                ))}
              </G>
            </Svg>
          )}

          {labels.map((l) => (
            <ArcLabel
              key={l.key}
              name={l.name}
              mid={l.mid}
              left={l.left}
              top={l.top}
              align={l.align}
              sweep={sweep}
            />
          ))}

          {/* The dominant numeral, in the slot DESIGN.md reserves for it on every screen. */}
          {size > 0 && (
            <View style={styles.center} pointerEvents="none">
              <FitWidth width={(size - g.stroke * 2) * CENTER_FILL}>
                <Amount cents={total} size="hero" tone="ink" />
                <Txt variant="micro" t="faint" style={styles.centerLabel}>
                  {label.toLocaleUpperCase('pt-BR')}
                </Txt>
              </FitWidth>
            </View>
          )}
        </View>
      </View>

      <View style={styles.legend}>
        {arcs.map((a) => (
          <LegendRow key={sliceKey(a)} slice={a} onSelect={onSelect} />
        ))}
      </View>
    </View>
  );
}

/**
 * Scales its content down, and only down, until it is no wider than `width`.
 *
 * It measures the content at its natural size and applies a transform, so the layout itself never
 * changes and the measurement stays true. A figure that already fits is left at full size.
 */
function FitWidth({ width, children }: { width: number; children: ReactNode }) {
  const [natural, setNatural] = useState(0);
  const scale = natural > width && width > 0 ? width / natural : 1;
  return (
    <View onLayout={(e) => setNatural(e.nativeEvent.layout.width)} style={{ transform: [{ scale }] }}>
      {children}
    </View>
  );
}

/**
 * One name, beside its arc. It is drawn in the ring's own frame and fades in as the sweep reaches it.
 *
 * The fade is driven by the same shared value as the arcs, so a name is never visible before the
 * segment it names has been drawn.
 */
function ArcLabel({
  name,
  mid,
  left,
  top,
  align,
  sweep,
}: {
  name: string;
  mid: number;
  left: number;
  top: number;
  align: 'left' | 'right' | 'center';
  sweep: SharedValue<number>;
}) {
  const fade = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, (sweep.value - mid) * 24)),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.label,
        { left, top, width: LABEL_W, alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' },
        fade,
      ]}
    >
      <Txt variant="micro" t="muted" numberOfLines={2} style={{ textAlign: align }}>
        {name}
      </Txt>
    </Animated.View>
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
  g,
  sweep,
}: {
  arc: DonutSlice & { start: number; end: number; broke: number | null };
  g: Geometry;
  sweep: SharedValue<number>;
}) {
  const tint = arc.isRest ? color.inkFaint : (categoryHue[arc.hue] ?? color.inkFaint);
  // Where the hue stops: at the notch when there is one, at the end of the arc otherwise.
  const hueEnd = arc.broke ?? arc.end;

  const hueProps = useAnimatedProps(() => {
    const len = Math.max(0, Math.min(sweep.value, hueEnd) - arc.start) * g.circ;
    return { strokeDasharray: [len, g.circ - len], strokeDashoffset: -arc.start * g.circ };
  });

  const overProps = useAnimatedProps(() => {
    if (arc.broke == null) return { strokeDasharray: [0, g.circ], strokeDashoffset: 0 };
    const len = Math.max(0, Math.min(sweep.value, arc.end) - arc.broke) * g.circ;
    return { strokeDasharray: [len, g.circ - len], strokeDashoffset: -arc.broke * g.circ };
  });

  const notch = arc.broke;
  const angle = notch == null ? 0 : notch * 2 * Math.PI;
  const cx = g.size / 2;

  return (
    <>
      <AnimatedCircle
        cx={cx}
        cy={cx}
        r={g.r}
        stroke={tint}
        strokeWidth={g.stroke}
        fill="none"
        animatedProps={hueProps}
      />
      {notch != null && (
        <>
          <AnimatedCircle
            cx={cx}
            cy={cx}
            r={g.r}
            stroke={color.negative}
            strokeWidth={g.stroke}
            fill="none"
            animatedProps={overProps}
          />
          {/*
            The cut. Ground-coloured and 2px, so it reads as the ring being interrupted rather than
            as a seventh mark added on top — the same "two states of one element" move `RuleBars`
            makes with its track.
          */}
          <Line
            x1={cx + (g.r - g.stroke / 2) * Math.cos(angle)}
            y1={cx + (g.r - g.stroke / 2) * Math.sin(angle)}
            x2={cx + (g.r + g.stroke / 2) * Math.cos(angle)}
            y2={cx + (g.r + g.stroke / 2) * Math.sin(angle)}
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
  // The frame is the full column width; the ring inside it is centred and sized to leave room for names.
  frame: { width: '100%', paddingVertical: LABEL_ROOM_Y, alignItems: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  centerLabel: { marginTop: 2, textAlign: 'center' },
  label: { position: 'absolute' },
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
