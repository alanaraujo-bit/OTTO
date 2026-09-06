import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Press } from './Press';
import { Txt } from '@/theme/text';
import { color } from '@/theme/tokens';
import { spring, useReducedMotion } from '@/theme/motion';

const ACTION_W = 76;

/**
 * As ações da linha, atrás da linha — a forma de gesto pedida para tudo que este app já deixa tocar
 * para agir.
 *
 * The row itself stays the tap target it always was: `onPress` is what a plain tap already did before
 * any of this existed, so the swipe is a second, faster path to the same place, never the only one.
 * Revealed rather than always visible, because "editar" e "excluir" sitting beside every figure, all
 * the time, is exactly the kind of furniture the balance curve's own "sem lista de contas a vencer"
 * argument was written against.
 *
 * Excluir fires the instant it is tapped, with no arm/disarm on top of it. The swipe and the tap are
 * already two deliberate gestures — the discipline most swipe-to-delete lists in mobile software
 * settle on — and a third "toque de novo" here would be that pattern doing the same job twice.
 *
 * **The actions are a parameter, because not every row has the same two.** A recorded entry can be
 * edited and deleted; a forecast can only be brought forward, since there is no row behind it to
 * edit or to delete. Hard-coding editar/excluir here would have forced the tape to either show a
 * forecast two actions that do nothing or to leave it with no gesture at all, and the width the
 * strip opens to has to follow the count for the same reason.
 */
export interface SwipeAction {
  label: string;
  tone: 'muted' | 'negative';
  onPress: () => void;
  /** Supplies its own warning haptic; the ordinary light tap would only compete with it. */
  warn?: boolean;
  /** Keeps the strip open after firing — for an action whose result the row has yet to reflect. */
  keepOpen?: boolean;
}

export function SwipeRow({
  height,
  actions,
  onPress,
  label,
  children,
}: {
  height: number;
  actions: SwipeAction[];
  onPress: () => void;
  /** What the row itself announces to a screen reader. */
  label: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const tx = useSharedValue(0);
  const start = useSharedValue(0);
  const OPEN = -ACTION_W * actions.length;

  const close = () => {
    tx.value = reduced ? withTiming(0) : withSpring(0, spring.crisp);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onStart(() => {
      start.value = tx.value;
    })
    .onUpdate((e) => {
      'worklet';
      tx.value = Math.min(0, Math.max(OPEN, start.value + e.translationX));
    })
    .onEnd((e) => {
      'worklet';
      const openEnough = tx.value < OPEN / 2 || e.velocityX < -500;
      tx.value = reduced
        ? withTiming(openEnough ? OPEN : 0)
        : withSpring(openEnough ? OPEN : 0, spring.crisp);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  // The strip only needs to answer touches once it is at least partly uncovered — closed, it sits
  // exactly under the row content and would otherwise steal taps meant for the row itself.
  const actionsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, tx.value / OPEN) }));

  return (
    <View style={[styles.wrap, { height }]}>
      <Animated.View style={[styles.actions, actionsStyle]} pointerEvents="box-none">
        {actions.map((action) => (
          <Action
            key={action.label}
            label={action.label}
            tone={action.tone}
            warn={action.warn}
            onPress={() => {
              if (action.warn) {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              }
              if (!action.keepOpen) close();
              action.onPress();
            }}
          />
        ))}
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.foreground, rowStyle]}>
          <Press
            onPress={() => (tx.value !== 0 ? close() : onPress())}
            outerStyle={styles.pressHit}
            style={styles.pressContent}
            haptic="none"
            accessibilityLabel={label}
          >
            {children}
          </Press>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Action({
  label,
  tone,
  warn,
  onPress,
}: {
  label: string;
  tone: 'muted' | 'negative';
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      onPress={onPress}
      outerStyle={styles.actionHit}
      style={styles.action}
      haptic={warn ? 'none' : 'light'}
      accessibilityLabel={label}
    >
      <Txt variant="label" f="sansMedium" t={tone} center>
        {label}
      </Txt>
    </Press>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  actions: { ...StyleSheet.absoluteFill, flexDirection: 'row', justifyContent: 'flex-end' },
  actionHit: { width: ACTION_W },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface },
  foreground: { flex: 1, backgroundColor: color.bg },
  pressHit: { flex: 1 },
  pressContent: { flex: 1, justifyContent: 'center', minHeight: 0 },
});
