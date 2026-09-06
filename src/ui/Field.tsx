import { forwardRef, useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { color, font, HIT, space, type } from '@/theme/tokens';
import { duration, ease, stagger, useReducedMotion } from '@/theme/motion';
import { Txt } from '@/theme/text';
import { useFocusSignal } from './FocusSignal';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  /** Rendered inside the field, right-aligned — used for the password reveal. */
  trailing?: { label: string; onPress: () => void };
  /** Position in the screen's ruling sequence. */
  index?: number;
  /**
   * DESIGN.md commits Geist Mono to every number in the app. `style` is deliberately excluded from
   * this component's props — the rule is the whole control, not a thing each caller retunes — so a
   * field showing a figure asks for mono this way instead of reaching around the restriction.
   */
  numeric?: boolean;
}

/**
 * A ledger line, not a box.
 *
 * The rule under the value is the whole control. It draws itself left to right on arrival — the same
 * gesture as the crossbar in the wordmark — then thickens and brightens under focus, and turns
 * `negative` with a short lateral nudge when the value is rejected.
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, trailing, index = 0, numeric, onFocus, onBlur, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const { setFocus, setWrite, pulseReject } = useFocusSignal();
  const [focused, setFocused] = useState(false);
  const masked = Boolean(rest.secureTextEntry);

  const focus = useSharedValue(0);
  const err = useSharedValue(0);
  const nudge = useSharedValue(0);
  /** The rule's own arrival. Rests drawn, so a stalled animation never leaves a missing line. */
  const drawn = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      drawn.value = 1;
      return;
    }
    const delay = stagger(index) + 120;
    drawn.value = withDelay(delay, withTiming(1, { duration: duration.rule, easing: ease.out }));
    const settle = setTimeout(() => {
      drawn.value = 1;
    }, delay + duration.rule + 400);
    return () => clearTimeout(settle);
  }, [reduced, index, drawn]);

  const hasError = Boolean(error);
  useEffect(() => {
    err.value = withTiming(hasError ? 1 : 0, { duration: duration.state, easing: ease.out });
    if (!hasError) return;

    // A rejected value is worth a distinct sensation, not the same tap as every other press.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    pulseReject();
    if (reduced) return;
    nudge.value = withSequence(
      withTiming(-5, { duration: 55, easing: ease.standard }),
      withTiming(4, { duration: 65, easing: ease.standard }),
      withTiming(-2, { duration: 55, easing: ease.standard }),
      withTiming(0, { duration: 75, easing: ease.out }),
    );
  }, [hasError, err, nudge, reduced, pulseReject]);

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (e) => {
      setFocused(true);
      focus.value = withTiming(1, { duration: duration.state, easing: ease.out });
      setFocus({ focused: true, slot: index, secure: masked });
      onFocus?.(e);
    },
    [focus, setFocus, index, masked, onFocus],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (e) => {
      setFocused(false);
      focus.value = withTiming(0, { duration: duration.state, easing: ease.out });
      setFocus({ focused: false });
      onBlur?.(e);
    },
    [focus, setFocus, onBlur],
  );

  // "Mostrar" flips the mask while the field still holds focus. Without this the screen would keep
  // averting its eyes from a password the user just chose to show.
  useEffect(() => {
    if (focused) setFocus({ focused: true, slot: index, secure: masked });
  }, [focused, masked, index, setFocus]);

  // How far along the line the caret has got. A full line is roughly this many characters at
  // `type.heading` inside a 24dp gutter, so the gaze reaches the right-hand end at about the point
  // the text does.
  useEffect(() => {
    if (focused) setWrite(Math.min(1, String(rest.value ?? '').length / 22));
  }, [focused, rest.value, setWrite]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: nudge.value }],
  }));

  const ruleStyle = useAnimatedStyle(() => {
    // Error outranks focus, and both are read continuously so the rule never jumps a step.
    const active = Math.max(focus.value, err.value);
    const restingToFocus = interpolateColor(focus.value, [0, 1], [color.hairline, color.ink]);
    return {
      height: 1 + active,
      backgroundColor: interpolateColor(err.value, [0, 1], [restingToFocus, color.negative]),
      opacity: Math.min(1, 0.55 + active * 0.45),
      transform: [{ scaleX: drawn.value }],
    };
  });

  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced ? 0 : -focus.value * 2 }],
  }));

  return (
    <Animated.View style={[styles.root, rowStyle]}>
      <Animated.View style={labelStyle}>
        <Txt variant="micro" f="sansMedium" t={error ? 'negative' : focused ? 'muted' : 'faint'}>
          {label.toUpperCase()}
        </Txt>
      </Animated.View>

      <View style={styles.row}>
        <TextInput
          ref={ref}
          {...rest}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={numeric ? styles.inputNumeric : styles.input}
          placeholderTextColor={color.inkFaint}
          selectionColor={color.ink}
          cursorColor={color.ink}
          underlineColorAndroid="transparent"
        />
        {trailing ? (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              trailing.onPress();
            }}
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

      <Animated.View style={[styles.rule, ruleStyle]} />

      {error ? (
        <Txt variant="micro" t="negative" style={styles.error}>
          {error}
        </Txt>
      ) : null}
    </Animated.View>
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
  inputNumeric: {
    flex: 1,
    minHeight: HIT,
    paddingVertical: space.sm,
    paddingHorizontal: 0,
    fontFamily: font.monoMedium,
    fontSize: type.heading.size,
    lineHeight: type.heading.leading,
    letterSpacing: type.heading.tracking,
    color: color.ink,
    fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : null),
  },
  trailing: { minHeight: HIT, justifyContent: 'center', paddingLeft: space.md },
  // The rule is drawn from its left edge, the way a line is ruled across a page.
  rule: { width: '100%', borderRadius: 1, transformOrigin: 'left' },
  error: { paddingTop: space.sm },
});
