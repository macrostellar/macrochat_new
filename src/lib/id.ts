import { Platform, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';

const WORDS = ['NOVA', 'RIVER', 'PIXEL', 'ORBIT', 'ECHO', 'LUNAR', 'MINT', 'SKY'];

export function generateMacroId() {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `MC-${word}-${suffix}`;
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(val?: string | null): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

export function localId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function copyToClipboard(text: string, label: string = 'Copied') {
  try {
    // Try Expo Clipboard first (works on native and some web)
    await Clipboard.setStringAsync(text);
    Alert.alert(label, text);
  } catch {
    try {
      // Fallback to Navigator Clipboard API (web)
      if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        Alert.alert(label, text);
      } else {
        Alert.alert('Copy failed', 'Please copy manually: ' + text);
      }
    } catch {
      Alert.alert('Copy failed', 'Please copy manually: ' + text);
    }
  }
}
