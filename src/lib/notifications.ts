import { Platform, Vibration } from 'react-native';
import type { NotificationPreferences } from '@/types';
import { playMessageTone, startCallRingtone, stopCallRingtone } from './ringtones';

// Push notifications are unavailable in Expo Go on SDK 53+ — only works in a development build.
let Notifications: typeof import('expo-notifications') | null = null;
let CALL_CHANNEL_ID = 'calls';
let MESSAGE_CHANNEL_ID = 'messages';
try {
  if (Platform.OS !== 'web') Notifications = require('expo-notifications');
  const { CALL_CHANNEL_ID: cid, MESSAGE_CHANNEL_ID: mid } = require('./push');
  CALL_CHANNEL_ID = cid;
  MESSAGE_CHANNEL_ID = mid;
} catch {
  // OK — running in Expo Go or environment doesn't support push.
}

export type NotificationCategory = 'messages' | 'calls' | 'status' | 'updates';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

if (isNative && Notifications) {
  Notifications.setNotificationHandler({
    // This handler only runs while the app is foregrounded. Remote pushes are
    // suppressed here because the realtime listener already raised a local
    // alert with the user's chosen ringtone; showing both would double up.
    handleNotification: async (notification) => {
      const isLocal = notification.request.content.data?.local === true;
      return {
        shouldShowBanner: isLocal,
        shouldShowList: isLocal,
        shouldPlaySound: false,
        shouldSetBadge: true,
      };
    },
  });
}

export function shouldNotify(
  category: NotificationCategory,
  prefs: NotificationPreferences,
  options?: { isMention?: boolean }
): boolean {
  const setting = prefs[category];
  if (setting === 'on') return true;
  if (setting === 'mentions' && options?.isMention) return true;
  return false;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isNative && Notifications) {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  }

  if (Platform.OS !== 'web' || typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (!isNative || !Notifications) {
    if (Platform.OS !== 'web' || typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  }
  return (await Notifications.getPermissionsAsync()).granted;
}

export function vibrateDevice(pattern: number | number[] = 200): void {
  if (isNative) {
    Vibration.vibrate(pattern as number);
    return;
  }
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

async function presentNotification(
  title: string,
  body: string,
  options: { category: NotificationCategory; badge: boolean; icon?: string }
): Promise<void> {
  if (isNative && Notifications) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        badge: options.badge ? 1 : undefined,
        data: { category: options.category, local: true },
        ...(Platform.OS === 'android'
          ? { channelId: options.category === 'calls' ? CALL_CHANNEL_ID : MESSAGE_CHANNEL_ID }
          : {}),
      },
      trigger: null,
    }).catch(() => undefined);
    return;
  }

  if (Platform.OS !== 'web' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: options.icon || '/favicon.ico',
      tag: options.category,
      requireInteraction: options.category === 'calls',
    });
  } catch {
    // A failed banner must never break message delivery.
  }
}

export async function triggerNotification(
  category: NotificationCategory,
  prefs: NotificationPreferences,
  options: {
    title: string;
    body?: string;
    messagePreview?: string;
    icon?: string;
    isMention?: boolean;
  }
): Promise<void> {
  if (!shouldNotify(category, prefs, { isMention: options.isMention })) return;

  let body = options.body || options.messagePreview || '';
  if (!prefs.preview) {
    body = category === 'calls' ? 'Incoming call' : 'New message';
  } else if (body.length > 120) {
    body = `${body.slice(0, 120)}…`;
  }

  await presentNotification(options.title, body, {
    category,
    badge: prefs.badge,
    icon: options.icon,
  });

  if (prefs.sound) {
    if (category === 'calls') {
      await startCallRingtone(prefs.callRingtone).catch(() => undefined);
    } else {
      await playMessageTone(prefs.messageRingtone).catch(() => undefined);
    }
  }

  if (prefs.vibration) {
    vibrateDevice(category === 'calls' ? [0, 500, 500, 500] : 200);
  }
}

/** Stops the looping call ringtone once a call is answered, declined or missed. */
export async function stopCallAlert(): Promise<void> {
  await stopCallRingtone().catch(() => undefined);
  if (isNative) Vibration.cancel();
}

export function getCategoryFromMessage(options: {
  isCall?: boolean;
  isStatus?: boolean;
  isUpdate?: boolean;
}): NotificationCategory {
  if (options.isCall) return 'calls';
  if (options.isStatus) return 'status';
  if (options.isUpdate) return 'updates';
  return 'messages';
}
