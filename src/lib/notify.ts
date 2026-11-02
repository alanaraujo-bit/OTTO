import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SecureStore from '@/lib/secure-storage';
import { Linking, Platform } from 'react-native';
import { dayKey, parseDay } from '@/domain/projection';
import { alertsFor, type Alert, type AlertKind } from '@/domain/alerts';
import { rhythmFor } from '@/domain/rhythm';
import { deferralMap } from '@/domain/deferral';
import type { Ledger } from '@/db/repo';

export type Capability = 'full' | 'no-device' | 'denied' | 'unknown';

/**
 * What the owner can switch on and off — by what the message is *for*, not by how loud it is.
 *
 * The old three levels (essencial, planejamento, completo) asked a first-time owner to predict which
 * level held the message they would want, and the default held almost nothing. Five plain switches,
 * all on, ask a simpler question: is there a kind of message you would rather not get?
 */
export type AlertGroup = 'risk' | 'bills' | 'income' | 'summaries' | 'nudge';
export type NotificationSettings = { enabled: boolean; groups: Record<AlertGroup, boolean> };

export const GROUPS: { key: AlertGroup; title: string; body: string }[] = [
  {
    key: 'risk',
    title: 'Quando é para se preocupar',
    body: 'Saldo que vai ficar negativo, teto estourando, conta vencida sem lançar, mês fechando no vermelho.',
  },
  { key: 'bills', title: 'Contas chegando', body: 'Na véspera, o que vence e onde o saldo fica. E a fatura no dia em que fecha.' },
  { key: 'income', title: 'Dinheiro entrando', body: 'No dia em que um salário ou outra entrada deve cair.' },
  { key: 'summaries', title: 'Resumos', body: 'Toda segunda, como está a semana. No dia 1 e no último dia, o mês.' },
  { key: 'nudge', title: 'Lembrete de lançar', body: 'Depois de três dias sem nada novo no razão.' },
];

const GROUP_OF: Record<AlertKind, AlertGroup> = {
  trough: 'risk',
  cap: 'risk',
  overdue: 'risk',
  shortfall: 'risk',
  due: 'bills',
  statement: 'bills',
  tomorrow: 'bills',
  income: 'income',
  week: 'summaries',
  monthOpen: 'summaries',
  monthClose: 'summaries',
  nudge: 'nudge',
};

/** Where a tap lands when the alert does not say. Always somewhere that explains the message. */
const ROUTE_OF: Partial<Record<AlertKind, string>> = {
  trough: '/calendario',
  statement: '/contas',
  tomorrow: '/calendario',
  cap: '/tetos',
};

const STORE_KEY = 'otto.notification-settings.v2';
const SENT_KEY = 'otto.notification-sent.v1';
/** Risk vibrates and shows high; routine arrives quietly. Two channels, so Android lets the owner tune each. */
const RISK = 'otto.risk';
const ROUTINE = 'otto.routine';

const ALL_ON: Record<AlertGroup, boolean> = { risk: true, bills: true, income: true, summaries: true, nudge: true };
/**
 * On by default. The switch that matters is the system permission, which the owner grants on
 * purpose; a second, hidden "enabled: false" behind it was the reason months went by with nothing.
 */
const DEFAULT_SETTINGS: NotificationSettings = { enabled: true, groups: ALL_ON };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Android 13 needs a channel before the system is allowed to show its permission prompt. */
async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(RISK, {
    name: 'Alertas',
    description: 'Quando algo no seu dinheiro precisa de atenção.',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
    vibrationPattern: [0, 180, 120, 180],
    showBadge: false,
  });
  await Notifications.setNotificationChannelAsync(ROUTINE, {
    name: 'Lembretes e resumos',
    description: 'Contas chegando, entradas, resumos da semana e do mês.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
    showBadge: false,
  });
  // The single channel of the first version is gone; leaving it would show an empty setting.
  await Notifications.deleteNotificationChannelAsync('otto.alerts').catch(() => {});
}

export async function readNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      enabled: saved.enabled !== false,
      groups: { ...ALL_ON, ...(saved.groups ?? {}) },
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

/**
 * Asks for the permission — or, once the system has stopped asking, opens the app's own settings
 * page, which is the only place left where the owner can say yes.
 */
export async function request(): Promise<Capability> {
  if (!Device.isDevice) return 'no-device';
  await ensureChannels();
  const current = await capability();
  if (current === 'full') return current;
  const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: false },
  });
  if (status === 'granted') return 'full';
  if (!canAskAgain) await Linking.openSettings().catch(() => {});
  return 'denied';
}

/**
 * Everything worth saying, from one ledger: the alarm (consequences the arithmetic finds) and the
 * rhythm (what is coming, what came, how the week and the month look). The rhythm's evening-before
 * reminder replaces the alarm's "tomorrow" summary, which said the same thing on fewer days.
 */
export function planFor(ledger: Ledger, today = dayKey(new Date())): Alert[] {
  const deferrals = deferralMap(ledger.deferrals);
  return [
    ...alertsFor(ledger.accounts, ledger.entries, ledger.series, today, deferrals, ledger.caps).filter(
      (a) => a.kind !== 'tomorrow',
    ),
    ...rhythmFor(ledger.accounts, ledger.entries, ledger.series, today, deferrals),
  ];
}

async function readSent(): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(SENT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * The schedule belongs to this device; the ledger it reads stays in the remote database.
 *
 * Everything is cancelled and placed again on every read of the ledger, so a paid bill takes its
 * reminder with it. The one thing that must survive a reschedule is the memory of a "once" alert
 * having gone out — otherwise it would be placed for tomorrow morning again, every day.
 */
export async function reschedule(alerts: Alert[]): Promise<number> {
  const settings = await readNotificationSettings();
  if (!settings.enabled || (await capability()) !== 'full') return 0;

  await ensureChannels();
  await Notifications.cancelAllScheduledNotificationsAsync();

  const now = Date.now();
  const sent = await readSent();
  let placed = 0;
  const seen = new Set<string>();

  for (const alert of alerts) {
    const group = GROUP_OF[alert.kind];
    if (!settings.groups[group] || seen.has(alert.id)) continue;
    seen.add(alert.id);

    let when = parseDay(alert.date);
    when.setHours(alert.hour ?? 9, 0, 0, 0);
    if (alert.once) {
      const first = sent[alert.id] ? Date.parse(sent[alert.id] as string) : null;
      if (first !== null && first <= now) continue; // it already went out
      if (first !== null) when = new Date(first); // keep the moment it was first promised
      else sent[alert.id] = when.toISOString();
    }
    if (when.getTime() <= now) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: alert.id,
      content: {
        title: alert.title,
        body: alert.body,
        data: {
          route: alert.route ?? ROUTE_OF[alert.kind] ?? '/home',
          params: alert.params ?? (ROUTE_OF[alert.kind] === '/calendario' ? { date: alert.date } : {}),
          kind: alert.kind,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: Platform.OS === 'android' ? (group === 'risk' ? RISK : ROUTINE) : undefined,
      },
    });
    placed += 1;
  }

  // Forget what is older than two months; ids carry their month, so nothing alive is lost.
  const horizon = now - 62 * 24 * 3600 * 1000;
  for (const [id, at] of Object.entries(sent)) if (Date.parse(at) < horizon) delete sent[id];
  await SecureStore.setItemAsync(SENT_KEY, JSON.stringify(sent)).catch(() => {});
  return placed;
}

export async function silence(): Promise<void> {
  if (!Device.isDevice) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** What is queued, soonest first — the screen shows it so the system is visible, not a promise. */
export async function pending(): Promise<{ id: string; title: string; body: string; date: Date | null }[]> {
  if ((await capability()) !== 'full') return [];
  const list = await Notifications.getAllScheduledNotificationsAsync();
  return list
    .map((item) => {
      const trigger = item.trigger as { value?: number; date?: number } | null;
      const at = typeof trigger?.value === 'number' ? trigger.value : typeof trigger?.date === 'number' ? trigger.date : null;
      return {
        id: item.identifier,
        title: item.content.title ?? '',
        body: item.content.body ?? '',
        date: at === null ? null : new Date(at),
      };
    })
    .filter((item) => item.id !== 'otto.test')
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
}

export async function testFire(): Promise<boolean> {
  if ((await capability()) !== 'full') return false;
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: 'otto.test',
    content: {
      title: 'OTTO consegue falar com você',
      body: 'Era só um teste. Os avisos de verdade chegam na hora em que fazem diferença.',
      data: { route: '/notificacoes', params: {} },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: Platform.OS === 'android' ? RISK : undefined,
    },
  });
  return true;
}
