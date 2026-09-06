import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { NavigationBar } from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
} from '@expo-google-fonts/geist-mono';
import { SnackbarHost } from '@/ui/Snackbar';
import { useSession } from '@/lib/auth/session';
import { color } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(color.bg);

export default function RootLayout() {
  const [fontsReady] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
  });

  const hydrate = useSession((s) => s.hydrate);
  const hydrated = useSession((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Every financial notification carries a date. A tap lands on that day in the calendar rather
  // than dropping the owner on a generic home screen and making them search for the reason.
  useEffect(() => {
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const data = event.notification.request.content.data;
      const date = typeof data?.date === 'string' ? data.date : undefined;
      router.push(date ? { pathname: '/calendario', params: { date } } : '/calendario');
    });
    return () => response.remove();
  }, []);

  useEffect(() => {
    if (fontsReady && hydrated) void SplashScreen.hideAsync();
  }, [fontsReady, hydrated]);

  if (!fontsReady || !hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <SnackbarHost>
          {/*
            Edge-to-edge is no longer a thing the app turns on — SDK 55 made it mandatory and took
            `translucent` and `backgroundColor` off StatusBar with it, because a bar the app draws
            under can only ever be transparent. All that is left to say is which way the glyphs go.
          */}
          <StatusBar style="light" />
          {/*
            The three Android buttons sitting under a quiet full-screen razão read as a phone
            borrowing the app's ground, not the app owning it — and on a curved OLED panel, that
            seam is the whole argument `Screen`'s rim light exists to make disappear one edge at a
            time. Hiding the bar leaves the system's own answer to "hidden until asked for" in
            place: a swipe in from the bottom edge — the gesture a phone owner already knows for
            reaching a system bar — brings it back for a moment before it excuses itself again.

            This used to be two imperative calls at module scope, one of which (`setBehaviorAsync`)
            SDK 57 deleted outright. The component is the better home anyway: it merges down the
            tree the way `StatusBar` does, so a screen that ever needs the bar back can say so
            locally instead of fighting a side effect that ran at import time. Android-only in
            effect — the component renders null on iOS, which has no such bar to hide.
          */}
          <NavigationBar hidden />
          {/*
            Material shared-axis. Sign-in and sign-up are siblings in one flow, so they move
            laterally; entering the app after auth is a change of context, so it fades through.

            `ios_from_right` over `slide_from_right`: the plain slide translates only the incoming
            screen, so the one being left behind just vanishes under it. `ios_from_right` moves the
            outgoing screen too, at a fraction of the speed, and dims it — two planes at two depths
            instead of one sheet sliding over a hole. That parallax is the whole difference between
            a screen change and a page turn.

            `animationDuration` is gone because it never did anything: native-stack honours it on
            iOS only, so the 320 written here was decoration. Android's timing comes from the preset.

            `freezeOnBlur` stops the screen underneath from re-rendering during the push, which is
            the cheapest frame we can buy back on the one transition the user actually watches.
          */}
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.bg },
              animation: 'ios_from_right',
              freezeOnBlur: true,
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            {/*
              The tabs carry no native animation at all, and that is the point.

              A tab change used to be a native fade *and* a `Reveal` fade — two curves driving the
              same pixel's opacity over the same moment, which this project has already learned reads
              as a stutter rather than as emphasis. Worse, the native fade is short and unstretchable
              on Android, so it set the tempo of the whole thing: 200ms of dissolve with a 12dp rise
              behind it, which is precisely what "seco" describes.

              With it gone, the bar is the element that stays — it appears at once, in the same place,
              because it is the same bar — and the content is the element that moves, travelling in
              from the side the owner came from over the better part of a second. One curve per
              pixel, and the transition belongs to the content, where Fase 1.8 established it has to
              live on Android.

              They still replace rather than push, so two tabs can never stack on each other.
            */}
            <Stack.Screen name="home" options={{ animation: 'none' }} />
            <Stack.Screen name="razao" options={{ animation: 'none' }} />
            <Stack.Screen name="analise" options={{ animation: 'none' }} />
            {/* Not a tab. Pushed from ajustes, so it slides laterally like any sibling in a flow. */}
            <Stack.Screen name="contas" />
            <Stack.Screen name="calendario" />
            <Stack.Screen name="notificacoes" />
            <Stack.Screen name="recorrencias" />
            <Stack.Screen name="tetos" />
            <Stack.Screen name="categorias" />
            <Stack.Screen name="recorrencia" />
            <Stack.Screen name="divida/[token]" options={{ animation: 'fade' }} />
            <Stack.Screen name="ajustes" options={{ animation: 'none' }} />
            {/* The door. It replaces the entry route rather than sitting on top of it, so there is
                no screen behind it to reach by dismissing. */}
            <Stack.Screen name="desbloquear" options={{ animation: 'fade', gestureEnabled: false }} />
            {/*
              Recording rises from the bar it was launched from rather than sliding in from the
              side. Lateral movement is this app's grammar for "a sibling screen"; capture is not a
              sibling of the home screen, it is a surface the home screen raises.
            */}
            <Stack.Screen name="lancar" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
        </SnackbarHost>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
