import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type TextStyle } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, { type SharedValue,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { Amount } from '../Amount';
import { Press } from '../Press';
import { CategoryIcon } from '../CategoryIcon';
import { categoryHue, categoryHues, color, space, type CategoryHue } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import type { CategoryIconName } from '@/domain/category';
import { brl, brlShort, type Cents } from '@/domain/money';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 208;
const STROKE = 26;
/** How much thicker the focused arc is drawn. Outward and inward alike, so it stays on its radius. */
const POP = 8;
// The radius leaves room for the focused width inside the canvas: drawn at the edge, a lifted arc
// was clipped flat where it met the Svg's bounds.
const R = (SIZE - STROKE - POP) / 2;
const CIRC = 2 * Math.PI * R;
/** 2px of ground between segments, expressed as the fraction of the ring it occupies. */
const GAP = 2 / CIRC;
/** One legend row, so the block can hold the height of the longer face and not jump on a swipe. */
export const LEGEND_ROW = 52;
/** Center text never grows past this: the hole is a fixed circle, not a column. */
const CENTER_SCALE = 1.2;

export interface DonutSlice {
  /** Unique within the ring — see `ringCut`. Never the label: two slices may not share a key. */
  key: string;
  category: string;
  icon: CategoryIconName;
  hue: CategoryHue;
  cents: Cents;
  /** The ceiling, or null when this category has none. */
  capCents: Cents | null;
  /**
   * What the ceiling is measured against: spend in this category in the calendar month, up to today.
   * Not `cents` — the ring may read a rolling thirty days, and a ceiling is a monthly figure.
   */
  capSpentCents?: Cents;
  /** The day, at the current pace, a ceiling not yet broken breaks — or null when it holds. */
  burstsOn?: string | null;
  /** The same category in the stretch before this one, or null when the ledger does not reach it. */
  beforeCents?: Cents | null;
  /** True for the aggregated remainder. It is not an identity, so it is not given a hue. */
  isRest?: boolean;
  /**
   * A real category that says nothing about where the money went — "Outros". It is drawn thin and
   * grey like the remainder, for the same reason: the five hues are for identity, and this has none.
   */
  plain?: boolean;
}

type ArcShape = DonutSlice & { start: number; end: number; stop: number; broke: number | null };

/** A line of words with figures in it. Figures are set in mono, per DESIGN.md; words are not. */
type Part = string | { n: string };
type Tone = 'faint' | 'warning' | 'negative';
type Said = { parts: Part[]; tone: Tone };

/**
 * One direction of the month's money, drawn as one ring.
 *
 * **The authored idea: the ceiling is a notch, and a notch only exists where one was crossed.**
 *
 * A pie tells you composition and stops. What the owner cannot work out from composition is whether
 * any of those slices went past what they said it could be — and that is the reading worth drawing,
 * because it is the only one that changes what they do next. So each arc is the category's share of
 * the month, and where a ceiling was broken the arc carries a cut: hue up to the notch, `negative`
 * past it. The red tail is the money spent past the ceiling, drawn to scale, so a category R$ 10
 * over and one R$ 400 over do not look alike.
 *
 * A ceiling that is holding draws nothing at all. `alerts.ts` states the rule this obeys — OTTO only
 * speaks when it knows something the owner does not — and "your budget is fine" is not that. The
 * consequence is that every notch on this ring is worth looking at, which is precisely what makes
 * the ring worth looking at. A ceiling on pace to break is news too, but news of a date, so it is
 * written rather than drawn: in its legend row, and under the total, where the hole says the one
 * thing worth knowing before it says anything else.
 *
 * `negative` here is not decoration and not a category colour: DESIGN.md reserves it for money going
 * out and overdue, and spending past a ceiling you set is exactly that. It is also why the category
 * palette holds no red — so this one red always means the same thing.
 *
 * **Identity owns the ring by geometry.** The arcs that name a place are drawn full width; "Outros"
 * and the remainder are drawn as thin lines on the same radius. A grey arc at full width was the
 * largest, brightest mass on the ring and it meant nothing — now the colours fill the band and the
 * unsorted money reads as what it is, a thread running through it.
 *
 * **The ring answers back.** Touching an arc, or its row in the legend, lifts that arc and thins the
 * rest, and the middle becomes that category's: its name, its exact amount, and the one thing about
 * it worth knowing — where its ceiling stands, else how it moved against the stretch before, else
 * its share. Touching the hole, or the same arc again, hands the middle back to the total.
 *
 * **Motion.** The ring rules itself clockwise from twelve, one continuous sweep rather than each
 * arc appearing at once. `motion.ts` names that thesis: every rule in this app is drawn in one
 * direction, decelerating, and a ring is that rule in polar form. Segments do not animate
 * individually — a single sweep passes through them, which is why the gaps read as gaps in one line
 * instead of as six things arriving. The legend writes itself with it: each row arrives as the sweep
 * reaches its arc.
 */
export function CategoryDonut({
  slices,
  total,
  direction,
  label,
  note,
  period,
  rows = 0,
  delay = 0,
}: {
  slices: DonutSlice[];
  total: Cents;
  /** Which way this money moved. It sets the total's tone and sign, and the word under a share. */
  direction: 'in' | 'out';
  /** What the figure in the middle is — the stretch it covers, named under the number it qualifies. */
  label: string;
  /** A second, quieter line under the label — the comparison with the period before, when known. */
  note?: string;
  /** The stretch being read, in words, for the sentence an empty face says instead of a ring. */
  period: string;
  /** Legend rows to reserve, so a shorter face does not pull the page up under the thumb. */
  rows?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(reduced ? 1 : 0);
  const [focus, setFocus] = useState<string | null>(null);

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
   * not — that is the point of it. `stop` is where the arc's share ends, gap included, which is what
   * a touch is measured against.
   *
   * Two arcs never wear the same hue. A hue follows its category everywhere else, but five hues
   * across any number of categories means two of them can share one, and a ring where two arcs are
   * the same teal cannot be read. So every arc whose hue is its own alone keeps it, and only the
   * smaller of a colliding pair borrows — from a hue no arc on this ring owns, so the borrowing never
   * cascades into moving a category that did not collide. The legend still names and draws the glyph
   * of each, so identity holds.
   */
  const arcs = useMemo<ArcShape[]>(() => {
    const sum = slices.reduce((n, s) => n + s.cents, 0);
    if (sum <= 0) return [];
    const taken = new Set<CategoryHue>();
    const own = slices.map((s) => {
      if (s.isRest || s.plain || taken.has(s.hue)) return null;
      taken.add(s.hue);
      return s.hue;
    });
    const owned = new Set(slices.filter((s) => !s.isRest && !s.plain).map((s) => s.hue));
    const spare = [...categoryHues.filter((h) => !owned.has(h)), ...categoryHues];
    let at = 0;
    return slices.map((s, i) => {
      let hue = own[i] ?? s.hue;
      if (own[i] == null && !s.isRest && !s.plain) {
        hue = spare.find((h) => !taken.has(h)) ?? s.hue;
        taken.add(hue);
      }
      const share = s.cents / sum;
      const start = at;
      at += share;
      // The gap is taken off the end of every arc, so a full ring of one category still closes.
      const end = Math.max(start, at - (slices.length > 1 ? GAP : 0));
      // The tail past the ceiling, as a fraction of this arc. Measured on the month the ceiling
      // belongs to, and clamped: a rolling window can hold less than the month to date on the 31st.
      const spent = s.capSpentCents ?? s.cents;
      const past =
        s.capCents != null && spent > s.capCents ? Math.min(1, (spent - s.capCents) / s.cents) : 0;
      return {
        ...s,
        hue,
        start,
        end,
        stop: at,
        broke: past > 0 ? end - (end - start) * past : null,
      };
    });
  }, [slices]);

  const empty = arcs.length === 0;
  const sum = arcs.reduce((n, a) => n + a.cents, 0);
  // A focus whose category left the ring (the data moved under it) is no focus — and is forgotten,
  // so the category does not light up again on its own when it comes back.
  const lit = arcs.find((a) => a.key === focus) ?? null;
  useEffect(() => {
    if (focus !== null && lit === null) setFocus(null);
  }, [focus, lit]);

  const whole = direction === 'out' ? 'das saídas' : 'das entradas';
  const totalTone = direction === 'out' ? 'negative' : 'positive';
  // The news, when there is any: the first ceiling through or on pace to break, in ring order.
  const news = arcs.map((a) => risk(a)).find((r) => r !== null) ?? null;

  const toggle = (key: string | null) => {
    void Haptics.selectionAsync();
    setFocus((f) => (f === key ? null : key));
  };

  /** A touch on the ring, resolved to the arc under it by angle; the hole hands back the total. */
  const pick = (x: number, y: number) => {
    const dx = x - SIZE / 2;
    const dy = y - SIZE / 2;
    const d = Math.hypot(dx, dy);
    if (d < R - STROKE / 2 - 4) {
      if (focus !== null) toggle(focus);
      return;
    }
    if (d > R + STROKE / 2 + 14) return;
    // atan2 is zero at three o'clock; the ring starts at twelve, a quarter turn earlier.
    const turn = (Math.atan2(dy, dx) / (2 * Math.PI) + 1.25) % 1;
    const hit = arcs.find((a) => turn >= a.start && turn < a.stop);
    if (hit) toggle(hit.key);
  };

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, success) => {
      if (success && !empty) pick(e.x, e.y);
    });

  if (empty) {
    // A face with nothing on it says so in a sentence. An empty circle reading "R$ 0" is a chart
    // drawn to show that there is no chart.
    return (
      <View style={{ minHeight: SIZE + space.xl + rows * LEGEND_ROW }}>
        <View style={styles.ring}>
          <Txt variant="body" t="faint" style={styles.emptyLine}>
            {direction === 'out' ? 'Nenhuma saída' : 'Nenhuma entrada'} {period}.
          </Txt>
        </View>
      </View>
    );
  }

  // What a screen reader hears as the ring's value; the label stays put so it is not re-announced
  // as a new control every time the focus moves.
  const spoken = lit
    ? `${lit.category}: ${brl(lit.cents)}, ${shareOf(lit.cents, sum)} ${whole}`
    : `${brl(total)} ${label}${news ? `. ${flat(news)}` : note ? `. ${note}` : ''}`;

  return (
    <View>
      <GestureDetector gesture={tap}>
        <View
          style={styles.ring}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={direction === 'out' ? 'Saídas por categoria' : 'Entradas por categoria'}
          accessibilityValue={{ text: spoken }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const i = arcs.findIndex((a) => a.key === focus);
            const step = e.nativeEvent.actionName === 'increment' ? 1 : -1;
            const next = (i + step + arcs.length + 1) % (arcs.length + 1);
            setFocus(arcs[next]?.key ?? null);
          }}
        >
          <Svg width={SIZE} height={SIZE}>
            {/* Rotated so the sweep starts at twelve rather than at three. */}
            <G rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}>
              {/* The track is the ordinary hairline, the same one every group boundary uses. */}
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke={color.hairline}
                strokeWidth={STROKE}
                fill="none"
                opacity={0.5}
              />

              {arcs.map((a) => (
                <Arc
                  key={a.key}
                  arc={a}
                  sweep={sweep}
                  state={lit === null ? 'rest' : lit.key === a.key ? 'lit' : 'dim'}
                  reduced={reduced}
                />
              ))}
            </G>
          </Svg>

          {/*
            The ring's total, at heading size. It used to be set at display scale, which made it a
            second hero on a screen DESIGN.md allows one — and at 44sp it was wider than the hole, so
            the "R$" and the centavos sat on the arcs. Heading, without centavos (the legend carries
            them), fits the hole with room to spare.

            The total wears its direction — "+" and `positive` for what came in, `negative` for what
            went out — because this ring shows either, and the colour is what tells a glance which one
            it is looking at. Under it, the stretch it covers, named where it qualifies the number: the
            hero above reports the month, this the last thirty days, and a "no total" under both made
            two different saídas look like one of them was wrong.

            A focused category's amount is identity, not direction, so it is set in ink, and with its
            centavos: it must be the exact figure its legend row states.

            The two states cross rather than cut: the leaving one fades as the arriving one does.
          */}
          <Animated.View
            key={lit?.key ?? '·total'}
            entering={FadeIn.duration(duration.state)}
            exiting={FadeOut.duration(duration.exit)}
            style={styles.center}
            pointerEvents="none"
          >
            {lit ? (
              <>
                <CategoryIcon name={lit.icon} size={18} tint={tintOf(lit)} />
                <Txt
                  variant="label"
                  t="muted"
                  numberOfLines={1}
                  maxFontSizeMultiplier={CENTER_SCALE}
                  style={styles.centerName}
                >
                  {lit.category}
                </Txt>
                <Amount cents={lit.cents} size="heading" tone="ink" />
                <SaidLine
                  said={
                    ceiling(lit) ??
                    moved(lit, period, true) ?? {
                      parts: [{ n: shareOf(lit.cents, sum) }, ` ${whole}`],
                      tone: 'faint',
                    }
                  }
                  lines={2}
                  style={styles.centerNote}
                />
              </>
            ) : (
              <>
                <Amount cents={total} size="heading" tone={totalTone} direction={direction} showCents={false} />
                <Txt variant="micro" t="faint" maxFontSizeMultiplier={CENTER_SCALE} style={styles.centerLabel}>
                  {label}
                </Txt>
                {news ? (
                  <SaidLine said={news} lines={2} style={styles.centerNote} />
                ) : note ? (
                  <SaidLine said={{ parts: [note], tone: 'faint' }} lines={2} style={styles.centerNote} />
                ) : null}
              </>
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={[styles.legend, { minHeight: rows * LEGEND_ROW }]}>
        {arcs.map((a) => (
          <Animated.View
            key={a.key}
            // Each row arrives as the sweep reaches its arc, so the list is written by the same
            // stroke that rules the ring.
            entering={FadeIn.delay(delay + a.start * duration.focal).duration(duration.state)}
          >
            <LegendRow
              slice={a}
              share={shareOf(a.cents, sum)}
              whole={whole}
              period={period}
              dim={lit !== null && lit.key !== a.key}
              selected={lit?.key === a.key}
              onPress={() => toggle(a.key)}
            />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/** A share of the ring as the legend and the middle state it: whole percent, never a bare "0%". */
function shareOf(part: Cents, whole: Cents): string {
  if (whole <= 0) return '0%';
  const p = (part / whole) * 100;
  return p < 1 ? '<1%' : `${Math.round(p)}%`;
}

/**
 * Where a ceiling stands, in money — "resta R$ 112", "R$ 46 acima do teto" — never in percent.
 *
 * A percentage beside an amount from a different window was a figure the owner could not check:
 * 689 ÷ 0,86 gives no ceiling anyone set. Reais left or reais over is the sum they would do anyway.
 * A ceiling reached exactly is reached, and says so, rather than promising a day already gone.
 */
/** Reais as parts: the symbol in sans, the figure in mono — a mono no-break space reads as two. */
function reais(cents: Cents): Part[] {
  const [symbol, figure] = brlShort(cents).split(' ');
  return [`${symbol} `, { n: figure ?? '' }];
}

function ceiling(slice: DonutSlice): Said | null {
  if (slice.capCents == null) return null;
  const spent = slice.capSpentCents ?? slice.cents;
  if (spent > slice.capCents) {
    return { parts: [...reais(spent - slice.capCents), ' acima do teto do mês'], tone: 'negative' };
  }
  if (spent === slice.capCents) return { parts: ['teto do mês atingido'], tone: 'negative' };
  const left = reais(slice.capCents - spent);
  if (slice.burstsOn) {
    // The day first: when the row is narrow, the ellipsis takes the remainder and not the news.
    return {
      parts: ['estoura dia ', { n: String(Number(slice.burstsOn.slice(8))) }, ' · resta ', ...left],
      tone: 'warning',
    };
  }
  return { parts: ['resta ', ...left, ' do teto do mês'], tone: 'faint' };
}

/** A ceiling worth raising before anything else, named, for the line under the total. */
function risk(slice: DonutSlice): Said | null {
  const c = ceiling(slice);
  if (!c || c.tone === 'faint') return null;
  if (c.tone === 'negative') return { parts: [`${slice.category} passou do teto`], tone: 'negative' };
  return {
    parts: [`${slice.category} estoura dia `, { n: String(Number(slice.burstsOn?.slice(8))) }],
    tone: 'warning',
  };
}

/**
 * How a category moved against the stretch before, in reais — "R$ 210 a mais", not "+12%": the
 * figure the owner would act on is the money, and a percentage of a small base says nothing. The
 * long form is for the middle of the ring, which has two lines; a row has one.
 */
function moved(slice: DonutSlice, period: string, long: boolean): Said | null {
  if (slice.beforeCents == null || slice.isRest) return null;
  const diff = slice.cents - slice.beforeCents;
  const month = period === 'no mês';
  if (diff === 0) {
    return {
      parts: [long ? `igual ${month ? 'ao mês anterior' : 'aos 30 dias anteriores'}` : 'igual a antes'],
      tone: 'faint',
    };
  }
  const then = long ? (month ? ' que no mês anterior' : ' que nos 30 dias anteriores') : ' que antes';
  return { parts: [...reais(Math.abs(diff)), ` a ${diff > 0 ? 'mais' : 'menos'}${then}`], tone: 'faint' };
}

function flat(said: Said): string {
  return said.parts.map((p) => (typeof p === 'string' ? p : p.n)).join('');
}

/** A `Said`, set: words in sans, figures in mono, one tone across both. */
function SaidLine({ said, lines, style }: { said: Said; lines: number; style?: TextStyle }) {
  return (
    <Txt variant="micro" t={said.tone} numberOfLines={lines} maxFontSizeMultiplier={CENTER_SCALE} style={style}>
      {said.parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <Txt key={i} variant="micro" f="mono" t={said.tone} tabular>
            {p.n}
          </Txt>
        ),
      )}
    </Txt>
  );
}

/**
 * The marks with no identity are grey: "Outros" because it is a category with no meaning, the
 * remainder because it is several the owner did not look at. `inkFaint` holds 3:1 on the ground;
 * the two are told apart by width, not by a darker grey that would read as empty track.
 */
function tintOf(slice: DonutSlice): string {
  if (slice.isRest || slice.plain) return color.inkFaint;
  return categoryHue[slice.hue] ?? color.inkFaint;
}

/** Full band for a place, a thread for the unsorted — thinner still for the remainder. */
function bandOf(slice: DonutSlice): number {
  if (slice.isRest) return 6;
  if (slice.plain) return 12;
  return STROKE;
}

/**
 * One arc, in up to three marks: the spend, the overflow, and the cut between them.
 *
 * Drawn with dash geometry rather than a path, because a stroked circle keeps its round caps and its
 * width without any of the arc-flag arithmetic an SVG path arc needs — and because the dash offset
 * is a single number, which is what lets the whole ring animate off one shared value.
 *
 * Focus is two more scalars on the same thread: `dim` thins the arcs that are not the subject and
 * lowers them a little — by geometry more than by fading, so they keep their colour and the key
 * still reads — and `pop` thickens the one that is.
 */
function Arc({
  arc,
  sweep,
  state,
  reduced,
}: {
  arc: ArcShape;
  sweep: SharedValue<number>;
  state: 'rest' | 'lit' | 'dim';
  reduced: boolean;
}) {
  const tint = tintOf(arc);
  const band = bandOf(arc);
  // Where the hue stops: at the notch when there is one, at the end of the arc otherwise.
  const hueEnd = arc.broke ?? arc.end;
  const dim = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    const d = state === 'dim' ? 1 : 0;
    const p = state === 'lit' ? 1 : 0;
    if (reduced) {
      dim.value = d;
      pop.value = p;
      return;
    }
    dim.value = withTiming(d, { duration: duration.state, easing: ease.standard });
    pop.value = withSpring(p, spring.crisp);
  }, [state, reduced, dim, pop]);

  const hueProps = useAnimatedProps(() => {
    const len = Math.max(0, Math.min(sweep.value, hueEnd) - arc.start) * CIRC;
    return {
      strokeDasharray: [len, CIRC - len],
      strokeDashoffset: -arc.start * CIRC,
      strokeWidth: band * (1 - 0.38 * dim.value) + POP * pop.value,
      opacity: 1 - 0.45 * dim.value,
    };
  });

  const overProps = useAnimatedProps(() => {
    if (arc.broke == null) {
      return { strokeDasharray: [0, CIRC], strokeDashoffset: 0, strokeWidth: band, opacity: 1 };
    }
    const len = Math.max(0, Math.min(sweep.value, arc.end) - arc.broke) * CIRC;
    return {
      strokeDasharray: [len, CIRC - len],
      strokeDashoffset: -arc.broke * CIRC,
      strokeWidth: band * (1 - 0.38 * dim.value) + POP * pop.value,
      opacity: 1 - 0.45 * dim.value,
    };
  });

  const notch = arc.broke;
  const angle = notch == null ? 0 : notch * 2 * Math.PI;
  const cx = SIZE / 2;
  // Long enough to cut the arc at its focused width too; past the ring it is ground on ground.
  const half = (band + POP) / 2 + 1;

  return (
    <>
      <AnimatedCircle
        cx={cx}
        cy={cx}
        r={R}
        stroke={tint}
        strokeWidth={band}
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
            strokeWidth={band}
            fill="none"
            animatedProps={overProps}
          />
          {/*
            The cut. Ground-coloured and 2px, so it reads as the ring being interrupted rather than
            as a seventh mark added on top — the same "two states of one element" move `RuleBars`
            makes with its track.
          */}
          <Line
            x1={cx + (R - half) * Math.cos(angle)}
            y1={cx + (R - half) * Math.sin(angle)}
            x2={cx + (R + half) * Math.cos(angle)}
            y2={cx + (R + half) * Math.sin(angle)}
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
 * repeats it — now in the arc's own hue, so shape and colour are one mark instead of a dot and a
 * grey glyph saying the same thing twice. That is what makes a five-hue palette honest on a ring
 * where any two categories can end up beside each other.
 *
 * The figures stand in a column on the right: the amount, and under it the bare share. That frees
 * the line under the name for what only this row can say — where its ceiling stands, or how it moved
 * against the stretch before. Touching a row focuses its arc, the same as touching the arc itself,
 * so the list and the ring are one control read two ways.
 *
 * A row that is not the focus dims its marks — the glyph, the figures — but never its words: a
 * sentence at faint-on-faint is one nobody can read.
 */
function LegendRow({
  slice,
  share,
  whole,
  period,
  dim,
  selected,
  onPress,
}: {
  slice: ArcShape;
  share: string;
  whole: string;
  period: string;
  dim: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const said = ceiling(slice) ?? moved(slice, period, false);

  return (
    <Press
      onPress={onPress}
      haptic="none"
      hitSlop={6}
      accessibilityLabel={`${slice.category}, ${brl(slice.cents)}, ${share} ${whole}${said ? `, ${flat(said)}` : ''}`}
      accessibilityState={{ selected }}
    >
      <View style={styles.row}>
        <View style={dim && styles.dim}>
          <CategoryIcon name={slice.icon} size={18} tint={tintOf(slice)} />
        </View>
        <View style={styles.name}>
          <Txt variant="body" t={dim ? 'muted' : 'ink'} numberOfLines={1}>
            {slice.category}
          </Txt>
          {said ? <SaidLine said={said} lines={1} /> : null}
        </View>
        <View style={[styles.figures, dim && styles.dim]}>
          <Amount cents={slice.cents} size="body" tone="ink" />
          <Txt variant="micro" f="mono" t="faint" tabular>
            {share}
          </Txt>
        </View>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  ring: { alignSelf: 'center', width: SIZE, height: SIZE, justifyContent: 'center', alignItems: 'center' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    // Inside the hole with a margin, so a second line of the note never reaches the arcs.
    paddingHorizontal: SIZE / 2 - (R - STROKE / 2) + space.md,
  },
  centerName: { marginTop: space.xs, marginBottom: 2 },
  centerLabel: { marginTop: 2 },
  centerNote: { marginTop: space.xs, textAlign: 'center' },
  emptyLine: { textAlign: 'center' },
  legend: { marginTop: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: LEGEND_ROW,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  dim: { opacity: 0.4 },
  name: { flexShrink: 1, flexGrow: 1 },
  figures: { alignItems: 'flex-end' },
});
