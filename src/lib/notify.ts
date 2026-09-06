import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { parseDay } from '@/domain/projection';
import type { Alert, AlertKind } from '@/domain/alerts';

export type Capability = 'full' | 'no-device' | 'denied' | 'unknown';
export type NotificationLevel = 'essential' | 'planning' | 'complete';
export type NotificationSettings = { enabled: boolean; level: NotificationLevel };

const STORE_KEY = 'otto.notification-settings.v1';
const CHANNEL = 'otto.alerts';
const DEFAULT_SETTINGS: NotificationSettings = { enabled: false, level: 'essential' };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Android 13 needs a channel before the system is allowed to show its permission prompt. */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Avisos financeiros',
    description: 'Avisos úteis sobre o seu fluxo financeiro.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
    showBadge: false,
  });
}

export async function readNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      enabled: saved.enabled === true,
      level: saved.level === 'planning' || saved.level === 'complete' ? saved.level : 'essential',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(settings));
}

/** Reads the device state without triggering a permission prompt. */
export async function capability(): Promise<Capability> {
  if (!Device.isDevice) return 'no-device';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'full' : status === 'denied' ? 'denied' : 'unknown';
}

/** Permission is asked only after the owner deliberately chooses an alert level. */
export async function request(): Promise<Capability> {
  if (!Device.isDevice) return 'no-device';
  await ensureChannel();
  const current = await capability();
  if (current === 'full' || current === 'denied') return current;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  });
  return status === 'granted' ? 'full' : 'denied';
}

function allowed(kind: AlertKind, level: NotificationLevel) {
  /*
   * A ceiling warning is essential.
   *
   * It is the only alert the owner explicitly asked to be given — "quando estiver próximo ele
   * avisa" — and it passes this file's own test: it carries a consequence they cannot reach by
   * looking, and it stays silent in every month the budget survives. Filing it under a level nobody
   * selects by default would be shipping the feature switched off.
   */
  if (level === 'essential') return kind === 'trough' || kind === 'cap';
  if (level === 'planning') return kind === 'trough' || kind === 'cap' || kind === 'statement';
  return true;
}

/** The schedule belongs to this device; the ledger it reads stays in the remote database. */
export async function reschedule(alerts: Alert[]): Promise<number> {
  const settings = await readNotificationSettings();
  if (!settings.enabled || (await capability()) !== 'full') return 0;

  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  let placed = 0;
  for (const alert of alerts.filter((item) => allowed(item.kind, settings.level))) {
    const when = parseDay(alert.date);
    when.setHours(9, 0, 0, 0);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: alert.id,
      content: {
        title: alert.title,
        body: alert.body,
        data: { route: '/calendario', date: alert.date, kind: alert.kind },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: Platform.OS === 'android' ? CHANNEL : undefined,
      },
    });
    placed += 1;
  }
  return placed;
}

export async function silence(): Promise<void> {
  if (!Device.isDevice) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function pending(): Promise<{ id: string; title: string; date: Date | null }[]> {
  if ((await capability()) !== 'full') return [];
  const list = await Notifications.getAllScheduledNotificationsAsync();
  return list.map((item) => {
    const trigger = item.trigger as { value?: number } | null;
    return {
      id: item.identifier,
      title: item.content.title ?? '',
      date: typeof trigger?.value === 'number' ? new Date(trigger.value) : null,
    };
  });
}

export async function testFire(): Promise<boolean> {
  if ((await capability()) !== 'full') return false;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: 'otto.test',
    content: {
      title: 'OTTO consegue falar com você',
      body: 'Era só um teste. Os avisos reais chegam quando há algo útil a decidir.',
      data: { route: '/calendario' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: Platform.OS === 'android' ? CHANNEL : undefined,
    },
  });
  return true;
}
