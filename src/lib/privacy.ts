import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIVACY_KEY = 'macrochat.privacy';

export type PrivacySettings = {
  shareTypingActivity: boolean;
  allowIncomingCalls: boolean;
  readReceipts: boolean;
  defaultMessageTtlSeconds: number | null;
};

export type BlockedContact = {
  id: string;
  macroId: string;
  displayName: string;
  avatarColor: string;
};

export const defaultPrivacySettings: PrivacySettings = {
  shareTypingActivity: true,
  allowIncomingCalls: true,
  readReceipts: true,
  defaultMessageTtlSeconds: null,
};

export async function readPrivacySettings() {
  const stored = await AsyncStorage.getItem(PRIVACY_KEY);
  if (!stored) return defaultPrivacySettings;
  try {
    return { ...defaultPrivacySettings, ...(JSON.parse(stored) as Partial<PrivacySettings>) };
  } catch {
    return defaultPrivacySettings;
  }
}

export async function writePrivacySettings(settings: PrivacySettings) {
  await AsyncStorage.setItem(PRIVACY_KEY, JSON.stringify(settings));
}