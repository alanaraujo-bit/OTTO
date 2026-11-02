import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import * as WebBrowser from 'expo-web-browser';
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
import { BlurTargetView } from 'expo-blur';
import { SnackbarHost } from '@/ui/Snackbar';
import { TabBar } from '@/ui/TabBar';
import { startCapture } from '@/state/capture';
import { readShare } from '@/lib/share';
import { OttoCapture } from '../modules/otto-capture';
import { useSession } from '@/lib/auth/session';
import { LockGate } from '@/lib/auth/LockGate';
import { color } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(color.bg);
// Web: the Google sign-in popup lands back on this origin; this hands its result to the opener and closes it.
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const [fontsReady] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
  });

  const page = useRef<View>(null);

  const hydrate = useSession((s) => s.hydrate);
  const hydrated = useSession((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // A tap lands where the message is explained — the bill it is about, the day in the calendar, the
  // keypad for "lance" — rather than on a generic home screen that leaves the owner searching.
  useEffect(() => {
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      const data = event.notification.request.content.data as
        | { route?: unknown; params?: unknown; date?: unknown }
        | undefined;
      const route = typeof data?.route === 'string' ? data.route : '/calendario';
      const params =
        data?.params && typeof data.params === 'object'
          ? (data.params as Record<string, string>)
          : typeof data?.date === 'string'
            ? { date: data.date }
            : {};
      // navigate, not push: a tab the message points at already exists, and must not be stacked twice.
      router.navigate({ pathname: route as never, params });
    });
    return () => response.remove();
  }, []);

  useEffect(() => {
    if (fontsReady && hydrated) void SplashScreen.hideAsync();
  }, [fontsReady, hydrated]);

  // Lançamento automático: the inbox listens from the start, and a receipt shared into OTTO — cold
  // start or not — is read the moment the app is ready to show it.
  useEffect(() => {
    if (!hydrated) return;
    const stop = startCapture();
    void readShare();
    const shared = OttoCapture?.addListener('onShare', () => void readShare());
    return () => {
      stop();
      shared?.remove();
    };
  }, [hydrated]);

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
          {/*
            The tab bar's glass blurs whatever is under it, and on Android that means the views it
            samples have to live inside a `BlurTargetView` the bar itself is not part of. So the
            whole stack is the target, and the one bar sits beside it — above every screen, mounted
            once, which is also what lets its lens move on the tap instead of after the next
            screen has mounted.
          */}
          <View style={{ flex: 1 }}>
            <BlurTargetView ref={page} style={{ flex: 1, backgroundColor: color.bg }}>
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
                  The five tabs are one stack screen: a tab navigator that builds each tab once and
                  keeps it (see `(tabs)/_layout.tsx`). Arriving at it from the door has no animation,
                  like any tab change used to; everything pushed over it slides as before.
                */}
                <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
                {/* Not a tab. Pushed from ajustes, so it slides laterally like any sibling in a flow. */}
                <Stack.Screen name="contas" />
                <Stack.Screen name="calendario" />
                <Stack.Screen name="notificacoes" />
                <Stack.Screen name="dados" />
                <Stack.Screen name="capturas" />
                <Stack.Screen name="automatico" />
                <Stack.Screen name="nota" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="tetos" />
                <Stack.Screen name="categorias" />
                <Stack.Screen name="recorrencia" />
                <Stack.Screen name="otto" />
                <Stack.Screen name="divida/[token]" options={{ animation: 'fade' }} />
                {/* The door. It replaces the entry route rather than sitting on top of it, so there is
                    no screen behind it to reach by dismissing. */}
                <Stack.Screen name="desbloquear" options={{ animation: 'fade', gestureEnabled: false }} />
                {/*
                  Recording rises from the bar it was launched from rather than sliding in from the
                  side. Lateral movement is this app's grammar for "a sibling screen"; capture is not a
                  sibling of the home screen, it is a surface the home screen raises.
                */}
                {/*
                  A blank Lançar is kept built in the background (see `TabBar`), so "+" only has to
                  slide it in. A Lançar sent somewhere — an entry to edit, a bill to settle, a
                  capture to confirm — is a different form: it gets an id of its own, so it is built
                  fresh with its params instead of taking over the blank one.
                */}
                <Stack.Screen
                  name="lancar"
                  options={{ animation: 'slide_from_bottom' }}
                  getId={({ params }) =>
                    params && Object.keys(params).length > 0 ? JSON.stringify(params) : 'blank'
                  }
                />
              </Stack>
            </BlurTargetView>
            <TabBar blurTarget={page} />
            {/* Last, so its curtain covers the bar too while the trinco is shut. */}
            <LockGate />
          </View>
        </SnackbarHost>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
