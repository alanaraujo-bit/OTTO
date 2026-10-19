import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { api, ApiError, OfflineError } from '@/lib/api';
import { saidPlainly } from '@/lib/errors';
import { useSnackbar } from '@/ui/Snackbar';

/**
 * Dictation for the Otto composer: record, transcribe on the server, hand the words back.
 *
 * **The words land in the draft, never in the conversation.** A transcriber that hears "vinte e
 * cinco" as "vinte e cinco mil" is wrong in exactly the way that matters here, so the text is set
 * into the input for the owner to read, fix and send themselves. Nothing is sent on their behalf.
 *
 * **Recorded for speech, not for fidelity.** One channel of AAC at 64 kb/s is transparent for a
 * voice and keeps two minutes near 1 MB on a phone connection. On Android the microphone source is
 * the one the platform tunes for recognition, which leaves out the call-style processing that
 * clips the ends of words.
 */

const SPEECH: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
  android: { ...RecordingPresets.HIGH_QUALITY.android, audioSource: 'voice_recognition' },
  web: { ...RecordingPresets.HIGH_QUALITY.web, bitsPerSecond: 64_000 },
};

/** Two minutes is a long message; the server's size cap is built on it. */
export const MAX_DICTATION_MS = 120_000;
/** Shorter than this is a slipped tap, not a sentence. */
const MIN_MS = 700;
/** Upload plus transcription. The server bounds its own provider call well inside this. */
const TIMEOUT_MS = 60_000;

/** The web records through MediaRecorder on a secure origin; where either is missing, no mic is drawn. */
export const canDictate =
  Platform.OS !== 'web' ||
  (typeof MediaRecorder !== 'undefined' && typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function');

/** `busy` is the microphone being switched on or off — no control may act until it settles. */
export type DictationPhase = 'idle' | 'busy' | 'recording' | 'transcribing';

export function useDictation(onText: (text: string) => void) {
  const recorder = useAudioRecorder(SPEECH);
  const snack = useSnackbar();
  const [phase, setPhase] = useState<DictationPhase>('idle');
  // Guards read the ref, not the state: two taps inside one frame must not start or stop twice.
  const live = useRef<DictationPhase>('idle');
  const go = (next: DictationPhase) => {
    live.current = next;
    setPhase(next);
  };

  async function start() {
    if (live.current !== 'idle') return;
    go('busy');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        snack(
          permission.canAskAgain
            ? 'Sem acesso ao microfone. Toque de novo e permita para falar com o Otto.'
            : 'O microfone está bloqueado para o OTTO. Libere nos ajustes do aparelho.',
          'error',
        );
        go('idle');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      go('recording');
    } catch {
      snack('Não deu para usar o microfone agora.', 'error');
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      go('idle');
    }
  }

  /** Switches the microphone off. The file, or null when there is nothing worth sending. */
  async function release(): Promise<string | null> {
    const long = recorder.getStatus().durationMillis >= MIN_MS;
    try {
      await recorder.stop();
    } catch {
      return null;
    } finally {
      // Back to a playback session, so iOS stops routing sound as if a call were on.
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
    // shortcut: the file stays in the OS cache directory until the system clears it; delete it after
    // upload with expo-file-system if recordings on the device ever matter.
    return long ? recorder.uri : null;
  }

  async function finish() {
    if (live.current !== 'recording') return;
    go('transcribing');
    if (recorder.getStatus().durationMillis >= MAX_DICTATION_MS) {
      snack('Chegou a 2 minutos. Transcrevendo o que você falou.');
    }
    const uri = await release();
    if (!uri) {
      snack('Não deu para ouvir. Fale e depois toque em concluir.');
      go('idle');
      return;
    }
    try {
      const { text } = await api<{ text: string }>('/v1/assistant/transcribe', {
        method: 'POST',
        body: await upload(uri),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      onText(text);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      snack(failure(e), 'error');
    }
    go('idle');
  }

  async function cancel() {
    if (live.current !== 'recording') return;
    go('busy');
    await release();
    go('idle');
  }

  return { phase, recorder, start, finish, cancel };
}

/** The recording as a one-part form. React Native streams a file URI itself; the web needs the bytes. */
async function upload(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') form.append('audio', await (await fetch(uri)).blob());
  else form.append('audio', { uri, name: 'fala.m4a', type: 'audio/mp4' } as unknown as Blob);
  return form;
}

/** What the owner reads when a dictation did not come back as text. */
function failure(e: unknown): string {
  // `saidPlainly`'s offline line is about writes ("antes de lançar de novo"); nothing was written here.
  if (e instanceof OfflineError) return 'Sem resposta do servidor. Confira a conexão e grave de novo.';
  if (e instanceof ApiError && e.status === 404) return 'O ditado ainda não está disponível neste servidor.';
  // 503 carries the server's own words — "não configurado", "sem créditos" — as a 4xx does.
  if (e instanceof ApiError && e.status === 503) return e.message;
  return saidPlainly(e);
}
