import { forwardRef, useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { color, font, HIT, motion, space, type } from '@/theme/tokens';
import { Txt } from '@/theme/text';

const AnimatedView = Animated.createAnimatedComponent(View);

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  /** Rendered inside the field, right-aligned — used for the password reveal. */
  trailing?: { label: string; onPress: () => void };
}

/**
 * A ledger line, not a box. The rule under the value is the whole control: it thickens and brightens
 * on focus, and turns `negative` when the field is in error.
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, trailing, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);
  const err = useSharedValue(0);

  // Mutating a shared value during render is not allowed; drive it from the prop in an effect.
  const hasError = Boolean(error);
  useEffect(() => {
    err.value = withTiming(hasError ? 1 : 0, { duration: motion.fast });
  }, [hasError, err]);

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (e) => {
      setFocused(true);
      focus.value = withTiming(1, { duration: motion.fast });
      onFocus?.(e);
    },
    [focus, onFocus],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (e) => {
      setFocused(false);
      focus.value = withTiming(0, { duration: motion.base });
      onBlur?.(e);
    },
    [focus, onBlur],
  );

  const ruleStyle = useAnimatedStyle(() => {
    // Error outranks focus, and both are read as a continuous value so the rule never jumps a step
    // mid-transition. Opacity is clamped: three additive terms can otherwise exceed 1.
    const active = Math.max(focus.value, err.value);
    const restingToFocus = interpolateColor(focus.value, [0, 1], [color.hairline, color.ink]);
    return {
      height: 1 + active,
      backgroundColor: interpolateColor(err.value, [0, 1], [restingToFocus, color.negative]),
      opacity: Math.min(1, 0.55 + active * 0.45),
    };
  });

  return (
    <View style={styles.root}>
      <Txt variant="micro" f="sansMedium" t={error ? 'negative' : focused ? 'muted' : 'faint'}>
        {label.toUpperCase()}
      </Txt>

      <View style={styles.row}>
        <TextInput
          ref={ref}
          {...rest}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={styles.input}
          placeholderTextColor={color.inkFaint}
          selectionColor={color.ink}
          cursorColor={color.ink}
          underlineColorAndroid="transparent"
        />
        {trailing ? (
          <Pressable
            onPress={trailing.onPress}
            hitSlop={12}
            style={styles.trailing}
            accessibilityRole="button"
            accessibilityLabel={trailing.label}
          >
            <Txt variant="micro" f="sansMedium" t="muted">
              {trailing.label.toUpperCase()}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      <AnimatedView style={[styles.rule, ruleStyle]} />

      {error ? (
        <Txt variant="micro" t="negative" style={styles.error}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { paddingTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: HIT,
    paddingVertical: space.sm,
    paddingHorizontal: 0,
    fontFamily: font.sans,
    fontSize: type.heading.size,
    lineHeight: type.heading.leading,
    letterSpacing: type.heading.tracking,
    color: color.ink,
    // The focus treatment is the rule below; the browser's default outline is not part of this
    // system and must not ship alongside it.
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
  },
  trailing: { minHeight: HIT, justifyContent: 'center', paddingLeft: space.md },
  rule: { width: '100%', borderRadius: 1 },
  error: { paddingTop: space.sm },
});
