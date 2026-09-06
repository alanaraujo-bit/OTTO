import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { color, radius, space } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import { Txt } from '@/theme/text';

type Kind = 'info' | 'error';
interface Msg {
  id: number;
  text: string;
  kind: Kind;
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useSnackbar = () => useContext(Ctx);

/**
 * A brief ledger signal, intentionally far from the capture controls at the bottom of the screen.
 * It is a transient readout rather than a dialog: never receives touches, never asks the owner to
 * dismiss it, and yields the stage before it becomes something to read around.
 */
export function SnackbarHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setLeaving(true);
    dismissTimer.current = setTimeout(() => {
      setMsg(null);
      setLeaving(false);
    }, duration.exit);
  }, []);

  const show = useCallback((text: string, kind: Kind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    seq.current += 1;
    setLeaving(false);
    setMsg({ id: seq.current, text, kind });
    if (kind === 'error') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    timer.current = setTimeout(dismiss, kind === 'error' ? 3600 : 2800);
  }, [dismiss]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <View
        pointerEvents="none"
        style={[styles.host, { paddingTop: insets.top + space.sm }]}
      >
        {msg ? <Signal key={msg.id} msg={msg} leaving={leaving} /> : null}
      </View>
    </Ctx.Provider>
  );
}

/**
 * The bar enters from the upper rim, as if a small line has been written into the ledger. Exit is
 * deliberately quicker: feedback should acknowledge the action, then leave the interface alone.
 */
function Signal({ msg, leaving }: { msg: Msg; leaving: boolean }) {
  const reduced = useReducedMotion();
  const phase = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    phase.value = withTiming(leaving ? 0 : 1, {
      duration: leaving ? duration.exit : duration.state,
      easing: leaving ? ease.inOut : ease.out,
    });
  }, [leaving, phase]);

  const shell = useAnimatedStyle(() => ({
    opacity: phase.value,
    transform: reduced ? [] : [{ translateY: (1 - phase.value) * -12 }],
  }));

  const rule = useAnimatedStyle(() => ({
    opacity: phase.value,
    transform: [{ scaleX: 0.25 + phase.value * 0.75 }],
  }));

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.signal, shell]}
    >
      <Animated.View style={[styles.rule, msg.kind === 'error' ? styles.ruleError : null, rule]} />
      <Txt variant="micro" f="sansMedium" t="ink" numberOfLines={2} style={styles.text}>
        {msg.text}
      </Txt>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingHorizontal: space.gutter,
  },
  signal: {
    width: 'auto',
    maxWidth: '78%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  rule: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: color.inkMuted,
    marginRight: space.sm,
  },
  ruleError: { backgroundColor: color.negative },
  text: { flexShrink: 1 },
});
