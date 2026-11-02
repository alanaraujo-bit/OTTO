import { useEffect, useState, type ReactNode } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTabsWithTriggers } from 'expo-router/ui';
import { color } from '@/theme/tokens';
import { ROUTE, TABS } from '@/lib/nav';
import { builtTabs, shownTab } from '@/ui/TabBar';

/** The bar's order, which is also each tab's index on the UI thread. */
const TRIGGERS = TABS.map((key) => ({
  type: 'internal' as const,
  name: ROUTE[key].slice(1),
  href: ROUTE[key],
}));

/**
 * The five places, each built once and kept, all of them on screen at once.
 *
 * Tabs used to be stack screens replaced on every tap, so every change of tab tore down the screen
 * being left and built the next one from nothing — hundreds of views, charts and gestures — and it
 * was measured on the device as the slowest thing in the app. Then they were a tab navigator that
 * kept each tab but took the hidden ones out of the window, so every change still re-attached the
 * tab coming back and re-drew all of it: 25–35ms frames, measured.
 *
 * Now the five scenes are stacked and the hidden ones are only transparent. A transparent view is
 * skipped by the GPU and keeps what it last drew, so showing a tab is a change of one opacity —
 * nothing is attached, laid out or drawn again. And the bar moves that opacity on the UI thread at
 * the tap (`shownTab`), so the tab is there on the next frame instead of after the JS thread has
 * processed the navigation; the navigator catches up underneath and hands the touches over.
 *
 * A hidden tab is not frozen: freezing runs every animated view's unmount and mount on each change.
 * It re-renders only when the ledger changes, which is rare and happens under the screen that
 * changed it. Each tab is built the first time it is needed, and the others are built one at a time
 * while the app is idle, so the first visit to each is already instant.
 *
 * The bar itself is not this navigator's: OTTO's glass bar is mounted once at the root, above every
 * screen, and drives navigation through `useNav`.
 */
export default function TabsLayout() {
  const { state, descriptors, NavigationContent } = useTabsWithTriggers({ triggers: TRIGGERS });
  const focusedKey = state.routes[state.index]!.key;
  const [built, setBuilt] = useState<ReadonlySet<string>>(() => new Set([focusedKey]));
  if (!built.has(focusedKey)) setBuilt(new Set(built).add(focusedKey));

  // However a tab was reached — the bar, a deep link, a total on the home screen — the scene ends up
  // showing what the navigator says.
  useEffect(() => {
    shownTab.value = state.index;
  }, [state.index]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    InteractionManager.runAfterInteractions(() => {
      state.routes.forEach((route, i) => {
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            InteractionManager.runAfterInteractions(() =>
              setBuilt((b) => (b.has(route.key) ? b : new Set(b).add(route.key))),
            );
          }, 1500 + i * 900),
        );
      });
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // Once: the five routes are fixed for the life of the navigator.
  }, []);

  return (
    <NavigationContent>
      <View style={styles.scene}>
        {state.routes.map((route, i) =>
          built.has(route.key) ? (
            <Scene key={route.key} index={i} focused={i === state.index}>
              {descriptors[route.key]?.render()}
            </Scene>
          ) : null,
        )}
      </View>
    </NavigationContent>
  );
}

function Scene({ index, focused, children }: { index: number; focused: boolean; children: ReactNode }) {
  useEffect(() => {
    builtTabs.add(index);
    return () => {
      builtTabs.delete(index);
    };
  }, [index]);

  const shown = useAnimatedStyle(() => ({ opacity: shownTab.value === index ? 1 : 0 }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: focused ? 1 : 0 }, shown]}
      pointerEvents={focused ? 'auto' : 'none'}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!focused}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, backgroundColor: color.bg },
});
