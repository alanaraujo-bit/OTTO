import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { router, Tabs } from 'expo-router';
import { color } from '@/theme/tokens';

/** The order the bar shows them in. The first is where a cold start lands. */
const KEEP = ['/razao', '/recorrencias', '/analise', '/ajustes'] as const;

/**
 * The five places, each built once and kept.
 *
 * Tabs used to be stack screens replaced on every tap, so every change of tab tore down the screen
 * being left and built the next one from nothing — hundreds of views, charts and gestures — and it
 * was measured on the device as the slowest thing in the app. Here each tab is mounted the first
 * time it is needed and then stays; changing tab only shows a screen that already exists.
 *
 * A hidden tab is not frozen. Freezing hides it inside a Suspense boundary, and React then runs every
 * animated view's unmount on the way out and its mount on the way back — all of a tab's animations
 * detached and re-attached on each change: ~75ms of JS and ~390 native prop updates, measured. A
 * hidden tab that stays live only re-renders when the ledger changes, which is rare and happens
 * while the screen that changed it is still on top.
 *
 * The change itself is instant, like a native tab bar's; the lens travelling in the glass bar is the
 * movement. Three alternatives were measured on the device and lost: a native shift of the scene
 * (the glass bar re-blurs everything under it on every frame the page moves), keeping hidden tabs
 * attached (`display: none` costs the same re-draw as detaching) and translating them off screen
 * (all five then re-record on each change — 150ms frames). What the frame that shows a tab costs is
 * now the drawing of that screen alone, which is why its heaviest views are kept cheap to draw.
 *
 * The bar itself is not this navigator's: OTTO's glass bar is mounted once at the root, above every
 * screen, and drives navigation through `useNav`. This navigator draws none.
 */
export default function TabsLayout() {
  // Build the other four while the owner is reading the first, one at a time and only when the app
  // is idle, so the first visit to each is already instant.
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    InteractionManager.runAfterInteractions(() => {
      KEEP.forEach((href, i) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) InteractionManager.runAfterInteractions(() => router.prefetch(href));
          }, 1500 + i * 900),
        );
      });
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        animation: 'none',
        freezeOnBlur: false,
        lazy: true,
        sceneStyle: { backgroundColor: color.bg },
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="razao" />
      <Tabs.Screen name="recorrencias" />
      <Tabs.Screen name="analise" />
      <Tabs.Screen name="ajustes" />
    </Tabs>
  );
}
