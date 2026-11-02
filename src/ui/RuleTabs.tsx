import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import { Press } from './Press';

/**
 * Sections of one screen, named in a row with a rule that travels to the one being read.
 *
 * The same grammar as SAÍDAS / ENTRADAS on the Home and SAÍDA / ENTRADA in lançar: this app says
 * "this one is chosen" with a rule, never with a filled pill. Here the rule is one piece that slides
 * between the names, so a change of section is seen as a movement along the row rather than as two
 * labels swapping weight — which is also what tells a first-time owner the row is a set of places.
 *
 * The names share the row equally, so the rule's travel is arithmetic, not measurement.
 */
export function RuleTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const reduced = useReducedMotion();
  const index = Math.max(0, tabs.findIndex((t) => t.key === value));
  const at = useSharedValue(index);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    at.value = reduced
      ? withTiming(index, { duration: duration.state, easing: ease.out })
      : withSpring(index, spring.crisp);
  }, [index, reduced, at]);

  const slot = width / tabs.length;
  // The width is a plain style; only the transform moves, so the rule never goes through layout.
  const rule = useAnimatedStyle(() => ({ transform: [{ translateX: at.value * slot }] }));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      <View style={styles.row}>
        {tabs.map((t) => {
          const on = t.key === value;
          return (
            <Press
              key={t.key}
              onPress={() => {
                if (!on) onChange(t.key);
              }}
              haptic={on ? 'none' : 'selection'}
              scale={0.98}
              outerStyle={styles.hit}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: on }}
            >
              <Txt variant="micro" f="sansMedium" t={on ? 'ink' : 'faint'} center style={styles.label}>
                {t.label.toUpperCase()}
              </Txt>
            </Press>
          );
        })}
      </View>
      <View style={styles.track}>
        {width > 0 ? <Animated.View style={[styles.rule, { width: slot }, rule]} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  /* Equal shares of the row belong to the touch targets; the label centres itself inside. */
  hit: { flex: 1 },
  tab: { alignItems: 'center', paddingBottom: space.xs },
  label: { letterSpacing: 0.8 },
  track: { height: 2, backgroundColor: color.hairline },
  rule: { position: 'absolute', left: 0, top: 0, height: 2, backgroundColor: color.ink },
});
