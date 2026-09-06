import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { color } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import { useAttention } from './FocusSignal';

const VB_W = 388;
const VB_H = 100;
const SW = 9;
const BAR_X1 = 122;
const BAR_X2 = 266;

/** Eye geometry. The O's are the mark; nothing below may change their stroke or radius. */
const EYE = [50, 338] as const;
const EYE_CY = 50;
const EYE_R = 45.5;
const PUPIL_R = 13;

/**
 * How far the pupil may travel and still sit clear of the ring. Split by axis because the two are
 * used together: the largest diagonal below stays inside `EYE_R - SW / 2 - PUPIL_R`.
 */
const GAZE_X_MAX = 9;
const GAZE_Y_MAX = 15;

const AEllipse = Animated.createAnimatedComponent(Ellipse);
const ALine = Animated.createAnimatedComponent(Line);
const APath = Animated.createAnimatedComponent(Path);

/**
 * react-native-svg does not reliably drive SVG geometry attributes from Reanimated on web. The mark
 * must be correct without the animation layer, so everything animated here is native-only and the
 * resting geometry is the finished mark — never a degenerate one.
 */
const CAN_ANIMATE_SVG = Platform.OS !== 'web';

/**
 * Marked as a worklet on purpose. A plain module-scope helper called from a worklet crosses to the
 * UI thread as serialised data, not as a function, and fails at the call site — "clamp is not a
 * function (it is Object)". Anything these worklets call has to be one too.
 */
function clamp(v: number, lo: number, hi: number) {
  'worklet';
  return Math.min(hi, Math.max(lo, v));
}

/** A closed lid: the eye bowed shut. Spans to the ring, so it reads as a lid and not as a mouth. */
const lidShut = (cx: number) => `M ${cx - 33} 42 Q ${cx} 64 ${cx + 33} 42`;
/** Shut and pleased. Used once, when a form has been accepted. */
const lidDone = (cx: number) => `M ${cx - 33} 56 Q ${cx} 32 ${cx + 33} 56`;

/**
 * What the mark is doing that the attention channel cannot say.
 *
 * `idle` reacts to whatever is happening; `done` is the one-off sign-off after a form is accepted;
 * `guard` is a held state rather than an event — the eyes shut and stay shut because the owner has
 * asked the app to be closed when it is not in their hands.
 *
 * These are moods and not attention because attention describes what is *happening to a control*.
 * Driving a persistent setting through `focus` would also lean the rim light in and hold it there,
 * which would say a field is focused when none is.
 */
export type Mood = 'idle' | 'done' | 'guard';

/**
 * OTTO, drawn rather than typeset — and awake.
 *
 * Two things are true about this mark at once, and the animation exists to say the second one out
 * loud:
 *
 *  1. It is built out of the system it fronts. The two T's share one continuous crossbar — the same
 *     hairline that rules every field on every screen.
 *  2. The two O's are a pair of eyes. So the mark watches: it follows your finger across the glass,
 *     reads along the line you are typing, **closes while a password is masked**, and opens the
 *     moment you choose to show it.
 *
 * That last beat is the point of the whole thing. It is not decoration — it is the product saying,
 * in the only language a logo has, that it is not reading your password over your shoulder.
 *
 * **How an eye closes.** The pupil is an ellipse, and closing squashes `ry` toward zero while `rx`
 * holds — which is what a lid coming down actually does to what you can see through it. A pupil that
 * shrinks in both axes reads as a dot receding, not as an eye. Blinking and the password close are
 * then the same motion at two speeds, so they can never disagree with each other.
 *
 * **One curve per pixel.** The eye opens on a single underdamped spring whose overshoot *is* the
 * widening. An earlier version ran a separate `peek` timing on top of that spring; two curves
 * driving one radius in different phases is exactly what a stutter is made of.
 *
 * Everything is additive. At rest — nothing focused, no animation layer, web, or "Remove animations"
 * — this renders exactly the mark it always was: four strokes and a rule.
 */
export function Wordmark({
  height = 34,
  stroke = color.ink,
  animate = false,
  alive = false,
  mood = 'idle',
}: {
  height?: number;
  stroke?: string;
  /** Rule the crossbar across on mount. */
  animate?: boolean;
  /** Subscribe the eyes to the screen's attention. Requires a `Screen` ancestor. */
  alive?: boolean;
  mood?: Mood;
}) {
  const width = (VB_W / VB_H) * height;
  const reduced = useReducedMotion();
  const attention = useAttention();
  const watching = alive && CAN_ANIMATE_SVG && attention !== null;

  // Rests at the finished mark. The entrance rewinds it, it never starts broken.
  const bar = useSharedValue(1);
  /**
   * 0 = the mark. 1 = the mark, looking at you.
   *
   * Seeded from `guard` rather than from zero. Every other state here is an event, and an event has
   * a reaction to carry it; guard is a state the mark can be *born into* — settings opened with the
   * trinco already on. Leaving the resting value at zero would make closed eyes reachable only
   * through an animation that may never run, and the caption would read "de olhos fechados" over a
   * mark with none. That is defect 2 of this project, restated.
   */
  const wake = useSharedValue(mood === 'guard' ? 1 : 0);
  /** 1 = open. Dips for a blink. */
  const lid = useSharedValue(1);
  /** 1 = eyes shut. Overshoots below 0 on release — that overshoot is the widening. */
  const shut = useSharedValue(mood === 'guard' ? 1 : 0);
  /** Smoothed 0/1: is the gaze on the finger rather than on the form. */
  const onFinger = useSharedValue(0);

  const done = mood === 'done';
  /** Held shut, deliberately. Not an event — the eyes stay closed until the owner reopens them. */
  const guard = mood === 'guard';

  useEffect(() => {
    if (!animate || !CAN_ANIMATE_SVG) return;
    bar.value = 0;
    bar.value = withDelay(
      120,
      withTiming(1, { duration: 560, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [animate, bar]);

  // Accepted: the eyes close pleased and the rule is drawn again — the mark signing the entry off.
  useEffect(() => {
    if (!done || !CAN_ANIMATE_SVG) return;
    bar.value = 0;
    bar.value = withTiming(1, { duration: duration.focal, easing: ease.out });
  }, [done, bar]);

  /**
   * What wakes the mark.
   *
   * Focus alone was wrong, and it made the eyes dead on every screen without a text field: the home
   * screen has none, so the pupils never left zero radius and the gaze had nothing to move. A finger
   * on the glass or a deliberate glance are attention too, and each of them is a reason to look up.
   */
  useAnimatedReaction(
    () => {
      if (!watching) return 0;
      if (done || guard) return 1;
      const a = attention!;
      return Math.max(a.focus.value, a.touching.value, Math.abs(a.glance.value) > 0.04 ? 1 : 0);
    },
    (target, previous) => {
      if (!watching || target === previous) return;
      wake.value = reduced
        ? withTiming(target, { duration: duration.state, easing: ease.out })
        : withSpring(target, spring.soft);
    },
    [watching, reduced, done, guard],
  );

  // Closing is a decision and takes its time. Opening is a release, and rides one spring all the way
  // home — `spring.pop` overshoots by about a quarter, so the pupil widens past its resting height
  // and settles back. That single curve is the entire "Mostrar" reaction.
  useAnimatedReaction(
    () => (watching ? (done || guard ? 1 : attention!.secure.value) : 0),
    (target, previous) => {
      if (!watching || target === previous) return;
      shut.value =
        target === 1
          ? withTiming(1, { duration: 260, easing: ease.inOut })
          : reduced
            ? withTiming(0, { duration: duration.state, easing: ease.out })
            : withSpring(0, spring.pop);
    },
    [watching, reduced, done, guard],
  );

  // Handing the gaze between the form and the finger is itself a movement, so it is eased. Without
  // this the eyes teleport the instant a finger lands.
  useAnimatedReaction(
    () => (watching && !reduced ? attention!.touching.value : 0),
    (target, previous) => {
      if (target === previous) return;
      onFinger.value = withTiming(target, { duration: 180, easing: ease.out });
    },
    [watching, reduced],
  );

  /**
   * Where to look.
   *
   * Both pupils carry the *same* offset — the eyes are 288 units apart, and true convergence at that
   * separation renders cross-eyed.
   *
   * Three sources, in priority order:
   *  - the finger, whenever one is on the glass;
   *  - otherwise the caret: `slot` places the field down the page, and `write` walks the gaze along
   *    the line as it fills, so the mark reads what you type;
   *  - plus `glance`, a deliberate look toward whatever is about to arrive on screen.
   *
   * `spring.follow` is what makes it trail instead of snap. A restarted spring inherits the pupil's
   * current velocity, so a finger dragged across the glass is chased, never tracked exactly.
   */
  const gazeX = useDerivedValue(() => {
    if (!watching || reduced) return 0;
    const a = attention!;
    const s = a.slot.value;
    // The start of a line is a look to the left; a full line has walked the gaze to the right.
    const caret =
      s < 0 ? 0 : clamp((s - 1.5) * 8 + (a.write.value * 2 - 1) * 7, -GAZE_X_MAX, GAZE_X_MAX);
    const finger = (a.touchX.value - 0.5) * 2 * GAZE_X_MAX;
    const m = a.focus.value;
    const target =
      caret * m * (1 - onFinger.value) +
      finger * onFinger.value +
      a.glance.value * GAZE_X_MAX * 0.9;
    return withSpring(clamp(target, -GAZE_X_MAX, GAZE_X_MAX), spring.follow);
  }, [watching, reduced]);

  const gazeY = useDerivedValue(() => {
    if (!watching || reduced) return 0;
    const a = attention!;
    const s = a.slot.value;
    const caret = s < 0 ? 0 : clamp(7 + s * 3.2, 0, GAZE_Y_MAX);
    // The mark sits near the top of the screen, so a finger below it is a look downward.
    const finger = clamp((a.touchY.value - 0.28) * 1.8 * GAZE_Y_MAX, -GAZE_Y_MAX * 0.4, GAZE_Y_MAX);
    const m = a.focus.value;
    const target = caret * m * (1 - onFinger.value) + finger * onFinger.value;
    return withSpring(clamp(target, -GAZE_Y_MAX, GAZE_Y_MAX), spring.follow);
  }, [watching, reduced]);

  // Idle blink. Randomised, so it never lands on a beat and starts reading as a loading indicator.
  const [blinkTick, setBlinkTick] = useState(0);
  useEffect(() => {
    if (!watching || reduced) return;
    const t = setTimeout(() => setBlinkTick((n) => n + 1), 2800 + Math.random() * 4200);
    return () => clearTimeout(t);
  }, [watching, reduced, blinkTick]);

  useEffect(() => {
    if (!watching || reduced || blinkTick === 0) return;
    // No guard on wake or shut: the pupil's height already multiplies by both, so a blink fired at a
    // closed or sleeping eye is arithmetically invisible. Reading those shared values here would be
    // a lie — they are written on the UI thread, and the JS-side copy is stale.
    const double = Math.random() < 0.25;
    lid.value = double
      ? withSequence(
          withTiming(0, { duration: 70, easing: ease.inOut }),
          withTiming(1, { duration: 90, easing: ease.out }),
          withTiming(0, { duration: 60, easing: ease.inOut }),
          withTiming(1, { duration: 110, easing: ease.out }),
        )
      : withSequence(
          withTiming(0, { duration: 75, easing: ease.inOut }),
          withTiming(1, { duration: 130, easing: ease.out }),
        );
  }, [blinkTick, watching, reduced, lid]);

  /** A rejected value squeezes the pupils and knocks the whole mark sideways, once. */
  const reject = useDerivedValue(() => (watching ? attention!.reject.value : 0), [watching]);

  /** Width holds while the eye closes; only the height collapses. That is what a lid does. */
  const pupilRx = useDerivedValue(() => PUPIL_R * wake.value * (1 - reject.value * 0.3));

  const pupilRy = useDerivedValue(() => {
    const open = lid.value * clamp(1 - shut.value, 0, 1.35);
    return Math.max(0, PUPIL_R * wake.value * open * (1 - reject.value * 0.6));
  });

  const leftPupil = useAnimatedProps(() => ({
    cx: EYE[0] + gazeX.value,
    cy: EYE_CY + gazeY.value + reject.value * 3,
    rx: pupilRx.value,
    ry: pupilRy.value,
  }));

  const rightPupil = useAnimatedProps(() => ({
    cx: EYE[1] + gazeX.value,
    cy: EYE_CY + gazeY.value + reject.value * 3,
    rx: pupilRx.value,
    ry: pupilRy.value,
  }));

  const lidOpacity = useAnimatedProps(() => ({
    strokeOpacity: clamp(shut.value, 0, 1) * wake.value,
  }));

  const barProps = useAnimatedProps(() => ({
    x2: BAR_X1 + (BAR_X2 - BAR_X1) * bar.value,
  }));

  // The knock lives on the wrapper, not the SVG: a plain RN transform, no geometry involved.
  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reduced ? 0 : Math.sin(reject.value * Math.PI * 2) * 5 }],
  }));

  // `lidDone` is the pleased arc, bowed up — satisfaction, and only ever for the sign-off. Guarding
  // is not satisfaction, so it takes the same lid a masked password takes.
  const lidPath = done ? lidDone : lidShut;

  /**
   * The resting geometry, as plain static props.
   *
   * Reanimated writes an animated prop to the native node when the value **changes**. Seeding `shut`
   * and `wake` at 1 for `guard` made the arithmetic right and, by doing so, removed the only thing
   * that ever wrote it: the delta. `withTiming(1)` from 1 produces no frame, nothing is committed,
   * and the static `strokeOpacity={0}` in the JSX stands — a mark with no eyelids under a caption
   * saying "de olhos fechados".
   *
   * So the static prop carries the resting value for the current mood, and the animation only ever
   * moves between resting states. That is this project's oldest rule, and the fix for defect 24
   * broke it by making the correct state reachable *only* through an animation that had no reason
   * to run.
   */
  const lidRest = mood === 'guard' ? 1 : 0;

  return (
    <Animated.View style={[styles.shell, shellStyle]}>
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        accessibilityRole="image"
        accessibilityLabel="OTTO"
      >
        <Circle cx={EYE[0]} cy={EYE_CY} r={EYE_R} stroke={stroke} strokeWidth={SW} fill="none" />
        <Line x1={158} y1={0} x2={158} y2={VB_H} stroke={stroke} strokeWidth={SW} />
        <Line x1={230} y1={0} x2={230} y2={VB_H} stroke={stroke} strokeWidth={SW} />
        <Circle cx={EYE[1]} cy={EYE_CY} r={EYE_R} stroke={stroke} strokeWidth={SW} fill="none" />

        <ALine
          x1={BAR_X1}
          y1={SW / 2}
          x2={BAR_X2}
          y2={SW / 2}
          animatedProps={barProps}
          stroke={stroke}
          strokeWidth={SW}
        />

        {watching ? (
          <>
            <AEllipse animatedProps={leftPupil} cx={EYE[0]} cy={EYE_CY} rx={0} ry={0} fill={stroke} />
            <AEllipse animatedProps={rightPupil} cx={EYE[1]} cy={EYE_CY} rx={0} ry={0} fill={stroke} />
            {EYE.map((cx) => (
              <APath
                key={cx}
                d={lidPath(cx)}
                animatedProps={lidOpacity}
                stroke={stroke}
                strokeWidth={SW}
                strokeLinecap="round"
                strokeOpacity={lidRest}
                fill="none"
              />
            ))}
          </>
        ) : null}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ shell: { alignSelf: 'flex-start' } });
