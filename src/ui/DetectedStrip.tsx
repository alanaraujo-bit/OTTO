import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { duration, ease, rowIn, rowOut, useReducedMotion } from '@/theme/motion';
import { useCapture } from '@/state/capture';
import { ChevronRight } from './Icon';
import { Press } from './Press';

/**
 * "3 lançamentos detectados" — under the month, the moment there is something to confirm.
 *
 * The one loop on the Home: a dot that breathes while lançamentos wait, because it means OTTO did
 * something on its own and is asking for a yes. It stops existing the moment the inbox is empty.
 */
export function DetectedStrip() {
  const items = useCapture((s) => s.items);
  const reduced = useReducedMotion();
  const breath = useSharedValue(1);

  useEffect(() => {
    if (reduced || items.length === 0) return;
    breath.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: duration.focal, easing: ease.inOut }),
        withTiming(1, { duration: duration.focal, easing: ease.inOut }),
      ),
      -1,
    );
  }, [reduced, items.length, breath]);
  const dot = useAnimatedStyle(() => ({ opacity: breath.value }));

  if (items.length === 0) return null;
  const names = items.slice(0, 2).map((d) => d.merchant);
  const more = items.length - names.length;

  return (
    <Animated.View entering={rowIn} exiting={rowOut}>
      <Press
        onPress={() => router.push('/capturas')}
        scale={0.99}
        style={styles.strip}
        accessibilityLabel={`${items.length} lançamentos detectados. Revisar.`}
      >
        <Animated.View style={[styles.dot, dot]} />
        <View style={styles.text}>
          <Txt variant="body" f="sansMedium" numberOfLines={1}>
            {items.length === 1 ? '1 lançamento detectado' : `${items.length} lançamentos detectados`}
          </Txt>
          <Txt variant="micro" t="faint" numberOfLines={1}>
            {more > 0 ? `${names.join(', ')} e mais ${more}` : names.join(' e ')}
          </Txt>
        </View>
        <Txt variant="label" t="muted">
          Revisar
        </Txt>
        <ChevronRight size={16} tint={color.inkMuted} />
      </Press>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: 16,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.ink },
  text: { flex: 1 },
});
