import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Push is unavailable in Expo Go on SDK 53+ — needs a development build.
let Notifications: typeof import('expo-notifications') | null = null;
try {
  if (Platform.OS !== 'web') Notifications = require('expo-notifications');
} catch {
  // OK — running in Expo Go or push not available.
}

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export const CALL_CHANNEL_ID = 'calls';
export const MESSAGE_CHANNEL_ID = 'messages';

/**
 * Android requires channels to exist before any notification can use them.
 *
 * Local channels are silent because `ringtones.ts` plays the user's chosen tone
 * itself. Remote pushes arrive when the app is dead and nothing can play audio,
 * so they use separate channels that carry the system sound.
 */
export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;

  await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: null,
  });

  await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
    name: 'Calls',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 500, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    sound: null,
  });

  await Notifications.setNotificationChannelAsync('messages_push', {
    name: 'Messages (app closed)',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });

  await Notifications.setNotificationChannelAsync('messages_silent', {
    name: 'Messages (silent)',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: null,
  });
}

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId
  );
}

/**
 * Registers this device for Expo push and stores the token against the user.
 * Returns the token, or null when push is unavailable (web, simulator, denied).
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  if (!Notifications) return null; // Not available in this environment.
  if (Platform.OS === 'web') return null;

  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return null;

  await configureNotificationChannels();

  const projectId = getProjectId();
  if (!projectId || !supabase) return null;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }

  await supabase
    .from('user_push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    )
    .then(() => undefined, () => undefined);

  return token;
}

export async function unregisterPushToken(token: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('user_push_tokens')
    .delete()
    .eq('token', token)
    .then(() => undefined, () => undefined);
}
