import { useEffect, type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
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

const LEFT: Slot[] = [
  { key: 'home', label: 'início', icon: NavHome },
  { key: 'ledger', label: 'razão', icon: NavLedger },
];

const RIGHT: Slot[] = [
  { key: 'stats', label: 'análise', icon: NavStats },
  { key: 'settings', label: 'ajustes', icon: NavSettings },
];

/** Where each tab sits across the five-slot row, as a fraction of the bar's width. */
const COLUMN: Record<TabKey, number> = { home: 0, ledger: 1, stats: 3, settings: 4 };
const SLOTS = 5;

/**
 * The instrument's controls.
 *
 * Recording is the product — PRODUCT.md puts time-to-record above everything else — so it is not one
 * of five equal destinations. It is the actuator: a filled ink disc that sits proud of the panel and
 * breaks the bar's top rule, which is the one place in this world where something is allowed to
 * interrupt a hairline. Everything else in the bar is the same open stroke at the same weight.
 *
 * **The bar is the thing that stays.** Every screen mounts its own copy, so it is the one element
 * that does not change while the content underneath it does — and the marker is what makes that
 * legible. There is a single marker for the whole bar rather than one per item, and on arrival it
 * **travels from the tab the owner just left to the one they chose**. A marker that simply appears
 * in its new place says "you are here"; one that slides says "you came from there", which is the
 * fact the transition is actually about.
 *
 * Navigation lives here rather than in four screens repeating the same switch. The bar knows the
 * order of its own slots, which is what makes a tab change have a direction at all.
 */
export function TabBar({ active, onCapture }: { active: TabKey; onCapture: () => void }) {
  const insets = useSafeAreaInsets();
  const go = useNav((s) => s.go);
  const from = useNav((s) => s.from);
  const reduced = useReducedMotion();

  const target = COLUMN[active];
  // Starts where the owner was, so the very first frame of the new screen already shows the movement
  // that brought them here. A cold start has no previous tab and so has nothing to travel from.
  const at = useSharedValue(from ? COLUMN[from] : target);

  useEffect(() => {
    at.value = reduced
      ? target
      : withTiming(target, { duration: duration.route, easing: ease.out });
  }, [target, reduced, at]);

  const marker = useAnimatedStyle(() => ({
    left: `${((at.value + 0.5) / SLOTS) * 100}%`,
  }));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      <View style={styles.rule} />

      {/* One marker for the bar, positioned over the row rather than parented to a slot — a marker
          inside an item could never travel to a different one. */}
      <View style={styles.markerRail} pointerEvents="none">
        <Animated.View style={[styles.marker, marker]} />
      </View>

      <View style={styles.row}>
        {LEFT.map((s) => (
          <Item key={s.key} slot={s} active={active === s.key} onSelect={go} />
        ))}

        <View style={styles.centre}>
          <Press
            onPress={onCapture}
            haptic="light"
            scale={0.93}
            dim={0.82}
            outerStyle={styles.actuatorLift}
            style={styles.actuatorHit}
            accessibilityLabel="Lançar"
          >
            {/* The ring is the app ground, so the bar's rule appears to part around the disc rather
                than to run underneath it. */}
            <View style={styles.actuatorRing}>
              <View style={styles.actuator}>
                <NavPlus size={24} tint={color.onInk} />
              </View>
            </View>
          </Press>
          <Txt variant="micro" t="muted" style={styles.centreLabel}>
            lançar
          </Txt>
        </View>

        {RIGHT.map((s) => (
          <Item key={s.key} slot={s} active={active === s.key} onSelect={go} />
        ))}
      </View>
    </View>
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
  const tint = active ? color.ink : color.inkFaint;

  return (
    <Press
      onPress={() => onSelect(slot.key)}
      haptic="selection"
      scale={0.94}
      style={styles.item}
      outerStyle={styles.itemHit}
      accessibilityLabel={slot.label}
      accessibilityState={{ selected: active }}
    >
      <Glyph size={21} tint={tint} />
      <Txt variant="micro" t={active ? 'muted' : 'faint'} numberOfLines={1} style={styles.label}>
        {slot.label}
      </Txt>
    </Press>
  );
}

const ACTUATOR = 46;
const MARKER_W = 18;

const styles = StyleSheet.create({
  bar: { paddingTop: 0 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  row: { flexDirection: 'row', alignItems: 'flex-start' },

  /* The rail spans the bar so the marker's percentage resolves against the same box the slots do,
     and sits where the old per-item mark sat: between the hairline and the glyphs. */
  markerRail: { height: 2, marginTop: space.sm },
  marker: {
    position: 'absolute',
    width: MARKER_W,
    height: 2,
    borderRadius: 1,
    marginLeft: -MARKER_W / 2,
    backgroundColor: color.ink,
  },

  /* The fifth of the row belongs to the touch target; the contents only centre themselves in it. */
  itemHit: { flex: 1 },
  item: { alignItems: 'center', paddingTop: space.xs, minHeight: 52, paddingHorizontal: 2 },
  label: { paddingTop: 3 },

  centre: { flex: 1, alignItems: 'center' },
  centreLabel: { paddingTop: 3 },
  /* The lift has to move the target, not just what is drawn in it. On the inner view the disc rose
     and its touch area stayed behind, so the visible button and the tappable button were 18dp
     apart — the one control on this bar that the product is built around. */
  actuatorLift: { marginTop: -20 },
  actuatorHit: { minHeight: 0 },
  actuatorRing: {
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: color.bg,
  },
  actuator: {
    width: ACTUATOR,
    height: ACTUATOR,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
