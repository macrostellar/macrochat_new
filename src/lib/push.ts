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
  if (!projectId || !supabase) throw new Error('Push registration requires the Expo project ID and a configured backend.');

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    throw new Error(`Could not register this device for push notifications: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { error } = await supabase
    .from('user_push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
  if (error) throw new Error(`Could not save this device's push token: ${error.message}`);

  return token;
}

export async function unregisterPushToken(token: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_push_tokens')
    .delete()
    .eq('token', token);
  if (error) throw new Error(`Could not remove push token: ${error.message}`);
}

export async function setApplicationBadgeCount(count: number): Promise<void> {
  if (!Notifications || Platform.OS === 'web') return;
  const updated = await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  if (!updated && Platform.OS === 'ios') console.warn('iOS did not allow updating the notification badge.');
}
