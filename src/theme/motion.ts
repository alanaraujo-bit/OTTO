import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

/**
 * OTTO's motion system.
 *
 * Thesis — "the ledger rules itself, and OTTO watches the writing".
 *
 * Two halves, one idea. The crossbar of the wordmark is a rule, and every rule in this app is drawn
 * the same way: left to right, decelerating. On entrance the screen rules itself the way a ledger is
 * ruled before anything is written in it.
 *
 * The other half is the mark's two O's, which are eyes. They open on the field you are writing in,
 * follow it down the page, and close while a password is masked. That is the same discipline stated
 * from the other side: the app shows you what it is attending to, so the attention is never a guess.
 *
 * Motion here explains state and relationship; it never decorates, and it is never the only path to
 * a correct static state.
 */

/** Durations express distance and consequence. Exits are faster than entrances. */
export const duration = {
  /** Immediate acknowledgement of a touch. */
  tap: 120,
  /** Routine state change: focus, colour, a rule thickening. */
  state: 220,
  /** A rule drawing itself, a label lifting. */
  rule: 420,
  /** Route change, sheet, overlay. */
  route: 320,
  /** The authored entrance. */
  focal: 620,
  /** Anything leaving. */
  exit: 160,
} as const;

/** Confident arrival. No bounce by reflex — this is an instrument, not a toy. */
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** For a value returning to rest after a nudge. */
  standard: Easing.bezier(0.2, 0, 0, 1),
} as const;

/** Springs for things that carry weight — meter segments, the success mark. */
export const spring = {
  soft: { damping: 18, stiffness: 180, mass: 0.9 },
  crisp: { damping: 22, stiffness: 320, mass: 0.7 },
  /**
   * Deliberately underdamped — about 25% overshoot. For a value that is *released* rather than set:
   * an eye opening, a cover coming off. The overshoot is the expression, so it must be the same
   * curve that carries the value home. Two curves stacked on one pixel read as a stutter, not as
   * enthusiasm.
   */
  pop: { damping: 12, stiffness: 220, mass: 1 },
  /** Trails a moving target without ever snapping to it. For following a finger. */
  follow: { damping: 18, stiffness: 95, mass: 0.55 },
} as const;

/**
 * A page that gains or loses a member. When a row is removed, an editor opens or a block appears,
 * everything after it glides to its new place instead of jumping there — the ledger re-ruling
 * itself around the change. Reanimated honours the system "Remove animations" setting for these.
 */
export const listLayout = LinearTransition.duration(duration.state).easing(ease.out);
/** A row joining a list after the screen has arrived. */
export const rowIn = FadeIn.duration(duration.state);
/** A message landing in a conversation: it rises a few dp into place, like a line being written. */
export const lineIn = FadeInDown.duration(duration.rule).easing(ease.out).withInitialValues({
  transform: [{ translateY: 10 }],
});
/** A row leaving. Faster than it arrived, as every exit is. */
export const rowOut = FadeOut.duration(duration.exit);

/** Sibling stagger for the ruling sequence. Capped so the whole screen never feels slow. */
export const stagger = (index: number, step = 55, cap = 6) =>
  Math.min(index, cap ?? 6) * (step ?? 55);

/**
 * Honours the Android "Remove animations" accessibility setting.
 *
 * Reduced motion means fewer and gentler animations, not none: feedback that confirms an action
 * still has to read, so callers keep colour and opacity changes and drop spatial movement.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
