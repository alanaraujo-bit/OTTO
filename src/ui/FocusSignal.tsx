import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { duration, ease } from '@/theme/motion';

/**
 * The screen's attention channel.
 *
 * A control tells the screen what is happening to it, without either side importing the other. Two
 * things listen:
 *
 *  - `Screen`'s rim light leans in. The Edge 60 Fusion's curved panel is the one piece of hardware
 *    this app is shaped around, so the light on the rim is the device acknowledging you.
 *  - The wordmark watches. Its two O's are eyes; this is what they see.
 *
 * Everything here is a shared value, so the whole reaction runs on the UI thread. No re-render, and
 * the finger position can be written at touch frequency without costing a single React commit.
 */
export interface Attention {
  /** 0/1 — is any control focused. */
  focus: SharedValue<number>;
  /** Index of the focused control in the screen's ruling sequence; -1 when none. */
  slot: SharedValue<number>;
  /** 0/1 — the focused control is masked input. */
  secure: SharedValue<number>;
  /** 0..1 — how far along its line the caret has travelled in the focused control. */
  write: SharedValue<number>;
  /** Pulses to 1 and back when a value is rejected. */
  reject: SharedValue<number>;
  /** -1..1 — a deliberate look aside, in the direction of something about to happen. */
  glance: SharedValue<number>;
  /** 0/1 — a finger is down somewhere on the screen. */
  touching: SharedValue<number>;
  /** Finger position, normalised to the screen. 0..1, origin top-left. */
  touchX: SharedValue<number>;
  touchY: SharedValue<number>;
}

export interface FocusState {
  focused: boolean;
  slot?: number;
  secure?: boolean;
}

interface Api {
  setFocus: (state: FocusState) => void;
  /** How full the focused line is, 0..1. Drives the gaze along the text as it is typed. */
  setWrite: (progress: number) => void;
  /** A value was rejected. Distinct from losing focus: the screen reacts, it does not look away. */
  pulseReject: () => void;
  /** Look aside before a transition. `dir` is -1 for back, 1 for forward. */
  look: (dir: number) => void;
}

const NOOP: Api = {
  setFocus: () => {},
  setWrite: () => {},
  pulseReject: () => {},
  look: () => {},
};

const ApiCtx = createContext<Api>(NOOP);
const AttentionCtx = createContext<Attention | null>(null);

export function FocusSignalProvider({ children }: { children: ReactNode }) {
  const focus = useSharedValue(0);
  const slot = useSharedValue(-1);
  const secure = useSharedValue(0);
  const write = useSharedValue(0);
  const reject = useSharedValue(0);
  const glance = useSharedValue(0);
  const touching = useSharedValue(0);
  const touchX = useSharedValue(0.5);
  const touchY = useSharedValue(0.5);

  const attention = useMemo<Attention>(
    () => ({ focus, slot, secure, write, reject, glance, touching, touchX, touchY }),
    [focus, slot, secure, write, reject, glance, touching, touchX, touchY],
  );

  const api = useMemo<Api>(
    () => ({
      setFocus: ({ focused, slot: at = -1, secure: masked = false }) => {
        focus.value = focused ? 1 : 0;
        // Blur leaves the last slot in place: the gaze relaxes back to centre via `focus`, so it
        // does not also snap sideways on the way out.
        if (focused) slot.value = at;
        secure.value = focused && masked ? 1 : 0;
      },
      setWrite: (progress) => {
        write.value = progress;
      },
      pulseReject: () => {
        reject.value = withSequence(
          withTiming(1, { duration: 90, easing: ease.out }),
          withTiming(0, { duration: duration.rule, easing: ease.out }),
        );
      },
      look: (dir) => {
        // Out fast, hold through the screen change, then home. The hold is what makes it read as
        // looking *at* the thing arriving rather than as a twitch.
        glance.value = withSequence(
          withTiming(dir, { duration: 140, easing: ease.out }),
          withDelay(260, withTiming(0, { duration: duration.rule, easing: ease.out })),
        );
      },
    }),
    [focus, slot, secure, write, reject, glance],
  );

  return (
    <AttentionCtx.Provider value={attention}>
      <ApiCtx.Provider value={api}>{children}</ApiCtx.Provider>
    </AttentionCtx.Provider>
  );
}

/** For controls that report their state. */
export const useFocusSignal = () => useContext(ApiCtx);

/** For surfaces that react to it. Null outside a `Screen`. */
export const useAttention = () => useContext(AttentionCtx);

/** Back-compat for the rim light, which only needs the 0/1. */
export const useFocusValue = () => useContext(AttentionCtx)?.focus ?? null;
