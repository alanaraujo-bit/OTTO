import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { color, radius, space } from '@/theme/tokens';
import { Txt } from '@/theme/text';

type Kind = 'info' | 'error';
interface Msg {
  id: number;
  text: string;
  kind: Kind;
}

const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});
export const useSnackbar = () => useContext(Ctx);

/** Material transient feedback: one at a time, never blocking, never a dialog. */
export function SnackbarHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const insets = useSafeAreaInsets();

  const show = useCallback((text: string, kind: Kind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setMsg({ id: seq.current, text, kind });
    timer.current = setTimeout(() => setMsg(null), 4200);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <View
        pointerEvents="none"
        style={[styles.host, { paddingBottom: insets.bottom + space.lg }]}
      >
        {msg ? (
          <Animated.View
            key={msg.id}
            entering={FadeInDown.duration(220)}
            exiting={FadeOutDown.duration(160)}
            style={styles.bar}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: msg.kind === 'error' ? color.negative : color.inkMuted },
              ]}
            />
            <Txt variant="label" t="ink" style={styles.text}>
              {msg.text}
            </Txt>
          </Animated.View>
        ) : null}
      </View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.gutter,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surfaceHi,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color.hairline,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: space.md },
  text: { flex: 1 },
});
