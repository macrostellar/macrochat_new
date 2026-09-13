import { Platform } from 'react-native';
import type { NotificationPreferences } from '@/types';

type NotificationCategory = 'messages' | 'groups' | 'calls' | 'status' | 'updates';

/**
 * Production-safe logger - only logs in development
 */
const prodLog = {
  log: (..._args: any[]) => {
    // Silent in production
  },
  error: (..._args: any[]) => {
    // Silent in production
  },
};

/**
 * Check if a notification should be triggered based on user preferences
 */
export function shouldNotify(
  category: NotificationCategory,
  prefs: NotificationPreferences,
  options?: { isMention?: boolean }
): boolean {
  const setting = prefs[category];
  
  // 'calls' only has 'on' | 'off'
  if (category === 'calls') {
    return setting === 'on';
  }

  // Others have 'on' | 'mentions' | 'off'
  if (setting === 'on') return true;
  if (setting === 'mentions' && options?.isMention) return true;
  return false;
}

/**
 * Show a browser notification (web only)
 */
export function showBrowserNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    requireInteraction?: boolean;
  }
): void {
  if (Platform.OS !== 'web' || typeof Notification === 'undefined') return;

  if (Notification.permission !== 'granted') {
    console.log('⚠️ Notification permission not granted');
    return;
  }

  try {
    new Notification(title, {
      body: options?.body,
      icon: options?.icon || '/favicon.ico',
      badge: options?.badge,
      tag: options?.tag,
      requireInteraction: options?.requireInteraction,
    });
  } catch (error) {
    // Silent fail in production
  }
}

/**
 * Play notification sound
 */
export async function playNotificationSound(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window as any).AudioContext || new (window as any).webkitAudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // Hz
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      // Silent fail in production
    }
  }
}

/**
 * Trigger a vibration (mobile only)
 */
export function vibrateDevice(duration: number = 200): void {
  if (Platform.OS === 'web') {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  }
}

/**
 * Request notification permission (web only)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof Notification === 'undefined') {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (error) {
      return false;
    }
  }

  return false;
}

/**
 * Main function to handle notification trigger
 */
export async function triggerNotification(
  category: NotificationCategory,
  prefs: NotificationPreferences,
  options: {
    title: string;
    body?: string;
    senderName?: string;
    messagePreview?: string;
    icon?: string;
    isMention?: boolean;
  }
): Promise<void> {
  // Check if notification should be shown
  if (!shouldNotify(category, prefs, { isMention: options.isMention })) {
    return;
  }

  // Build notification message
  let notificationBody = options.body || options.messagePreview || '';
  if (prefs.preview && options.messagePreview && options.messagePreview.length > 100) {
    notificationBody = options.messagePreview.substring(0, 100) + '...';
  } else if (!prefs.preview) {
    notificationBody = 'New message';
  }

  // Show browser notification
  if (prefs.preview) {
    showBrowserNotification(options.title, {
      body: notificationBody,
      icon: options.icon,
      tag: category,
      requireInteraction: category === 'calls',
    });
  } else {
    showBrowserNotification(options.title, {
      body: 'You have a new message',
      tag: category,
    });
  }

  // Play sound if enabled
  if (prefs.sound) {
    await playNotificationSound();
  }

  // Vibrate if enabled
  if (prefs.vibration) {
    vibrateDevice(200);
  }
}

/**
 * Determine notification category from message or event
 */
export function getCategoryFromMessage(options: {
  isGroup?: boolean;
  isCall?: boolean;
  isStatus?: boolean;
  isUpdate?: boolean;
}): NotificationCategory {
  if (options.isCall) return 'calls';
  if (options.isStatus) return 'status';
  if (options.isUpdate) return 'updates';
  if (options.isGroup) return 'groups';
  return 'messages';
}
