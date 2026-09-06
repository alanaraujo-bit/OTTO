import { useEffect } from 'react';
import { Keyboard } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { duration, ease } from '@/theme/motion';

/**
 * Reports whether the software keyboard is up, as a UI-thread value.
 *
 * The Edge 60 Fusion is 986dp tall, and an open keyboard takes roughly a third of that. Screens use
 * this to fold away what is only context — the wordmark, a subtitle — so the field being typed into
 * keeps its breathing room instead of being pushed against the keyboard.
 */
export function useKeyboardOpen(): SharedValue<number> {
  const open = useSharedValue(0);

  useEffect(() => {
    const set = (v: number) => {
      open.value = withTiming(v, { duration: duration.route, easing: ease.out });
    };
    // Android emits the `did` events; `will` exists only on iOS.
    const show = Keyboard.addListener('keyboardDidShow', () => set(1));
    const hide = Keyboard.addListener('keyboardDidHide', () => set(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [open]);

  return open;
}
