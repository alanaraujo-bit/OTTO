import { requireOptionalNativeModule } from 'expo';

/** One notification the listener kept, exactly as the bank posted it. */
export interface RawCapture {
  id: string;
  pkg: string;
  title: string;
  text: string;
  postedAt: number;
}

/** What was shared into OTTO: the text, and/or a file copied into the app's cache. */
export interface Shared {
  text: string | null;
  uri: string | null;
  mime: string | null;
}

interface Subscription {
  remove(): void;
}

interface OttoCaptureNative {
  isListenerEnabled(): boolean;
  openListenerSettings(): void;
  openAppDetails(): void;
  setWatched(packages: string[]): void;
  setAnnounce(on: boolean): void;
  announces(): boolean;
  pending(): RawCapture[];
  remove(ids: string[]): void;
  takeShared(): Shared | null;
  recognize(uri: string, mime: string | null): Promise<string>;
  addListener(event: 'onCapture' | 'onShare', listener: (payload: { id?: string }) => void): Subscription;
}

/**
 * The native side of lançamento automático, or null where it does not exist — the web build, iOS,
 * or an APK built before this module. Every caller treats null as "this phone cannot", never as an
 * error, so the rest of the app is unchanged on those.
 */
export const OttoCapture = requireOptionalNativeModule<OttoCaptureNative>('OttoCapture');
