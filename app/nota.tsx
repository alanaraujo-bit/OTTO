import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Button } from '@/ui/Button';
import { useSnackbar } from '@/ui/Snackbar';
import { Txt } from '@/theme/text';
import { color, radius, space } from '@/theme/tokens';
import { useCapture, captureId } from '@/state/capture';
import { nfceKey, readNfcePage } from '@/domain/capture';

/*
 * The camera is required lazily: expo-router loads every route when the app opens, and a build
 * without the camera's native side would otherwise blank the whole app over one screen.
 */
const camera: typeof import('expo-camera') | null = requireOptionalNativeModule('ExpoCamera')
  ? require('expo-camera')
  : null;

/**
 * Ler nota fiscal: the QR on a cupom, to a lançamento.
 *
 * The camera opens on a frame and waits; the moment a NFC-e code is in it, the phone answers with a
 * tap of haptics, reads the SEFAZ page for the store, the total and the time, and the purchase lands
 * in Detectados ready to confirm. When the state's page will not say the total, the keypad opens
 * with the store already named, so the owner types one number instead of the whole lançamento.
 */
export default function Nota() {
  return (
    <Screen>
      {camera ? (
        <Body cam={camera} />
      ) : (
        <>
          <BackBar onPress={() => router.back()} />
          <Txt variant="body" t="muted" style={styles.heading}>
            Esta versão do app ainda não tem a câmera. Atualize o OTTO para ler notas fiscais.
          </Txt>
        </>
      )}
    </Screen>
  );
}

function Body({ cam }: { cam: typeof import('expo-camera') }) {
  const { CameraView, useCameraPermissions } = cam;
  const snack = useSnackbar();
  const add = useCapture((s) => s.add);
  const [permission, ask] = useCameraPermissions();
  const [reading, setReading] = useState(false);
  const locked = useRef(false);

  const scanned = async (data: string) => {
    if (locked.current) return;
    locked.current = true;
    const key = nfceKey(data);
    if (!key) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      snack('Esse QR não é de uma nota fiscal. Procure o QR Code no rodapé do cupom.', 'error');
      setTimeout(() => (locked.current = false), 2200);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setReading(true);
    try {
      const url = data.startsWith('http') ? data : `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${key.key}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15) OTTO' } });
      clearTimeout(timer);
      const d = readNfcePage(await res.text(), key, captureId('nota'));
      if (d) {
        add(d);
        router.replace('/capturas');
        return;
      }
      throw new Error('unreadable');
    } catch {
      snack('A Sefaz não mostrou o total dessa nota. Digite o valor e o resto já está preenchido.', 'info');
      router.replace({ pathname: '/lancar', params: { title: 'Nota fiscal', direction: 'out' } });
    }
  };

  if (!permission) return <BackBar onPress={() => router.back()} />;

  return (
    <View style={styles.flex}>
      <BackBar onPress={() => router.back()} />
      <View style={styles.heading}>
        <Txt variant="title" f="sansSemibold">
          Ler nota fiscal
        </Txt>
        <Txt variant="body" t="muted" style={styles.intro}>
          Aponte para o QR Code no rodapé do cupom. O OTTO busca a loja e o total na Sefaz.
        </Txt>
      </View>

      {permission.granted ? (
        <View style={styles.viewfinder}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={reading ? undefined : ({ data }) => void scanned(data)}
          />
          {/* Four corners, not a box: the frame says where to aim without hiding the picture. */}
          <View style={styles.frame} pointerEvents="none">
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          {reading ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.reading}>
              <ActivityIndicator color={color.ink} />
              <Txt variant="body" style={styles.readingText}>
                Lendo a nota…
              </Txt>
            </Animated.View>
          ) : null}
        </View>
      ) : (
        <View style={styles.ask}>
          <Txt variant="body" t="muted">
            O OTTO usa a câmera só para ler o QR Code. Nenhuma foto é guardada.
          </Txt>
          <View style={styles.askButton}>
            <Button label="Permitir câmera" onPress={() => void ask()} />
          </View>
        </View>
      )}
    </View>
  );
}

const CORNER = 34;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heading: { paddingTop: space.lg },
  intro: { paddingTop: space.xs },
  viewfinder: {
    flex: 1,
    marginTop: space.xl,
    marginBottom: space.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: color.surface,
  },
  frame: { ...StyleSheet.absoluteFill, margin: '18%' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: color.ink },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  reading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,9,11,0.72)',
    gap: space.md,
  },
  readingText: { paddingTop: space.sm },
  ask: { paddingTop: space.xl },
  askButton: { paddingTop: space.lg },
});
