import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { color, radius, space } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
import { NavHome, NavLedger, NavPlus, NavSettings, NavStats } from './Icon';
import { Press } from './Press';
import { TABS, useNav, type TabKey } from '@/lib/nav';

export type { TabKey };

interface Slot {
  key: TabKey;
  label: string;
  icon: ComponentType<{ size?: number; tint?: string }>;
}

const SLOTS: Record<TabKey, Slot> = {
  home: { key: 'home', label: 'início', icon: NavHome },
  ledger: { key: 'ledger', label: 'razão', icon: NavLedger },
  stats: { key: 'stats', label: 'análise', icon: NavStats },
  settings: { key: 'settings', label: 'ajustes', icon: NavSettings },
};

/** Which routes are tabs. Any other route — a pushed screen, the door, auth — has no bar. */
const ROUTE_TAB: Record<string, TabKey> = {
  '/home': 'home',
  '/razao': 'ledger',
  '/analise': 'stats',
  '/ajustes': 'settings',
};

const BAR = 64;
/** The glass between the capsule's rim and the lens, so the lens reads as sitting *in* the bar. */
const INSET = 5;
const GAP = space.md;
/** Inactive glyphs and labels: ink, dimmed — muted grey fell to ~3:1 over a bright chart under the glass. */
const IDLE = 'rgba(242, 244, 247, 0.68)';

/**
 * How far from the bottom edge the bar floats.
 *
 * The system navigation bar is hidden, so the bottom inset is zero — but the gesture strip that
 * brings it back is still there, and a drag that starts on a control inside it goes home instead.
 * The floor keeps the whole capsule above that strip.
 */
function useLift() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, space.xl) + space.sm;
}

/**
 * How much room a scrolling tab screen must leave under its last row.
 *
 * The bar floats over the content instead of sitting below it, so without this the end of every
 * list would live permanently under glass — readable through it, never tappable.
 */
export function useTabBarClearance() {
  return BAR + useLift() + space.lg;
}

/**
 * The instrument's controls, as a pane of glass floating over the page.
 *
 * **There is one bar, and it outlives the tabs.** It is mounted once at the root, above the stack,
 * rather than once per screen. A bar per screen could only move its lens after the next screen had
 * mounted — most of a second after the tap, with the lens appearing already halfway there. A bar
 * that stays can answer the finger: the lens leaves the moment the tab is chosen, and the content
 * catches up underneath it. It fades away whenever the route is not a tab.
 *
 * Two pieces, the way the platform's own floating bars are built: a capsule holding the four
 * destinations, and beside it the actuator. Recording is the product — PRODUCT.md puts
 * time-to-record above everything else — so it is not a fifth destination squeezed into the row. It
 * is the one filled ink object on the screen, under the right thumb, and it never moves.
 *
 * **The glass is real.** On Android the blur samples the app through the `BlurTargetView` the root
 * layout wraps the stack in, so a chart scrolling underneath shows through, softened. The dark tint
 * over it is heavy on purpose: this world's colour means money, and glass that let a red figure or a
 * category arc pass at strength would leak that colour into the controls. Where the platform cannot
 * blur (Android 11 and below) the tint alone carries it.
 *
 * **The rim is lit.** DESIGN.md treats the panel's curve as a light source; the bar gets the same
 * treatment at small scale — a bright hairline along its top edge, the way a rounded edge catches
 * light from above.
 *
 * **The lens travels** from the tab the owner left to the one they chose, stretching on the way and
 * settling back into shape — briefly, because a control that keeps wobbling after the finger has
 * gone reads as a toy, not as glass.
 */
export function TabBar({ blurTarget }: { blurTarget?: RefObject<View | null> }) {
  const lift = useLift();
  const pathname = usePathname();
  const routeTab = ROUTE_TAB[pathname];
  const current = useNav((s) => s.current);
  const go = useNav((s) => s.go);
  const reduced = useReducedMotion();
  const [slotWidth, setSlotWidth] = useState(0);

  // `go` moves `current` before it navigates, which is what lets the lens leave on the tap. A route
  // reached any other way — the cold-start redirect, a deep link — only tells us through the path,
  // so the store is brought in line with it here.
  useEffect(() => {
    if (routeTab && routeTab !== useNav.getState().current) {
      useNav.setState({ current: routeTab, from: null, direction: 0 });
    }
  }, [routeTab]);

  const visible = routeTab != null;
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, {
      duration: visible ? duration.state : duration.exit,
      easing: ease.out,
    });
  }, [visible, shown]);

  const target = TABS.indexOf(current);
  const at = useSharedValue(target);
  const stretch = useSharedValue(0);
  const aimed = useRef(target);

  // Shared values animate on the UI thread, so a lens sent on its way here keeps moving while the
  // JS thread is busy building the next screen — which takes most of a second for the razão. Sending
  // it from a React effect instead would wait for that render to finish first.
  const moveTo = (index: number) => {
    if (index === aimed.current) return;
    aimed.current = index;
    if (reduced) {
      at.value = index;
      return;
    }
    at.value = withSpring(index, { damping: 26, stiffness: 320, mass: 0.8 });
    stretch.value = withSequence(
      withTiming(1, { duration: 90, easing: ease.out }),
      withSpring(0, { damping: 22, stiffness: 400, mass: 0.7 }),
    );
  };

  // A tab reached without a tap on the bar still moves the lens.
  useEffect(() => moveTo(target));

  // The navigation waits one frame. Writes to shared values reach the UI thread when the JS task
  // that made them ends, and the next screen's render is one long task — so without the yield the
  // lens would sit still until that render finished, which is the very delay it exists to hide.
  const select = (key: TabKey) => {
    moveTo(TABS.indexOf(key));
    requestAnimationFrame(() => go(key));
  };

  const dock = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: reduced ? 0 : (1 - shown.value) * 24 }],
  }));

  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));

  const lens = useAnimatedStyle(() => ({
    width: slotWidth,
    transform: [
      { translateX: at.value * slotWidth },
      { scaleX: 1 + stretch.value * 0.12 },
      { scaleY: 1 - stretch.value * 0.05 },
    ],
  }));

  const onCapsule = (e: LayoutChangeEvent) => {
    const w = (e.nativeEvent.layout.width - INSET * 2) / TABS.length;
    setSlotWidth((prev) => (prev === w ? prev : w));
  };

  return (
    <>
      {/* Content passing through the gap beside the capsule is cut sharp by both edges; a short fade
          at the foot of the screen lets it go soft instead. */}
      <Animated.View
        style={[styles.fade, { height: BAR + lift + space.xl }, fade]}
        pointerEvents="none"
      >
        <LinearGradient colors={['rgba(8,9,11,0)', 'rgba(8,9,11,0.55)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        style={[styles.dock, { bottom: lift }, dock]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        <View style={styles.capsuleShadow}>
          <View style={styles.capsule} onLayout={onCapsule}>
            <Glass blurTarget={visible ? blurTarget : undefined} />

            {/* Positioned over the row rather than parented to a slot — a lens inside an item could
                never travel to a different one. Hidden until the row has a width to divide. */}
            {slotWidth > 0 ? (
              <Animated.View style={[styles.lens, lens]} pointerEvents="none">
                <LinearGradient
                  colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)']}
                  style={StyleSheet.absoluteFill}
                />
                <Rim />
              </Animated.View>
            ) : null}

            <View style={styles.row}>
              {TABS.map((key) => (
                <Item key={key} slot={SLOTS[key]} active={current === key} onSelect={select} />
              ))}
            </View>
          </View>
        </View>

        <Press
          onPress={() => router.push('/lancar')}
          haptic="light"
          scale={0.92}
          dim={0.85}
          outerStyle={styles.actuatorShadow}
          style={styles.actuator}
          accessibilityLabel="Lançar"
        >
          {/* Shading, not decoration: lighter at the top and a breath darker at the foot is what
              makes a flat disc read as a rounded, lit object beside the glass. */}
          <LinearGradient
            colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 'rgba(8,9,11,0.10)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <NavPlus size={26} tint={color.onInk} />
        </Press>
      </Animated.View>
    </>
  );
}

/**
 * The pane itself: blurred page, dark tint, a sheen across the upper half, a lit top edge.
 *
 * Without a target there is nothing to sample, so the blur is left out entirely — a hidden bar
 * should not keep re-rendering the page behind it every frame.
 */
function Glass({ blurTarget }: { blurTarget?: RefObject<View | null> }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {blurTarget ? (
        <BlurView
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={70}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={styles.tint} />
      <LinearGradient
        colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55]}
        style={StyleSheet.absoluteFill}
      />
      <Rim />
    </View>
  );
}

/** A hairline border, brightest along the top edge where the light falls. */
function Rim() {
  return (
    <>
      <View style={styles.edge} />
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.highlight}
      />
    </>
  );
}

function Item({
  slot,
  active,
  onSelect,
}: {
  slot: Slot;
  active: boolean;
  onSelect: (key: TabKey) => void;
}) {
  const Glyph = slot.icon;

  return (
    <Press
      onPress={() => onSelect(slot.key)}
      haptic="selection"
      scale={0.9}
      dim={0.7}
      style={styles.item}
      outerStyle={styles.itemHit}
      hitSlop={0}
      accessibilityLabel={slot.label}
      accessibilityState={{ selected: active }}
    >
      <Glyph size={22} tint={active ? color.ink : IDLE} />
      <Txt
        variant="micro"
        f={active ? 'sansMedium' : 'sans'}
        numberOfLines={1}
        style={[styles.label, !active && styles.idle]}
      >
        {slot.label}
      </Txt>
    </Press>
  );
}

const SHADOW = '0px 10px 28px rgba(0, 0, 0, 0.55)';

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },

  /* Inside the curve-safe gutter: the bar is a touch target, and no touch target enters the curve. */
  dock: {
    position: 'absolute',
    left: space.gutter,
    right: space.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
  },

  capsuleShadow: { flex: 1, borderRadius: radius.pill, boxShadow: SHADOW },
  capsule: { height: BAR, borderRadius: radius.pill, overflow: 'hidden' },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16, 18, 22, 0.58)' },

  edge: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.13)',
  },
  /* Held off the rounded ends so the light lies along the flat of the top edge only. */
  highlight: { position: 'absolute', top: 0, left: '12%', right: '12%', height: 1.5 },

  lens: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },

  row: { ...StyleSheet.absoluteFill, flexDirection: 'row', paddingHorizontal: INSET },
  /* The quarter of the row belongs to the touch target; the contents only centre themselves in it. */
  itemHit: { flex: 1 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: 2 },
  idle: { color: IDLE },

  actuatorShadow: { borderRadius: radius.pill, boxShadow: SHADOW },
  actuator: {
    width: BAR,
    height: BAR,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
