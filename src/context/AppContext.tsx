import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { DEFAULT_PROFILE_AVATARS } from '@/components/Avatar';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import type { AppearanceSettings, CallHistoryEntry, CallOutcome, Chat, Message, MessageKind, Profile, ProfileStatus, UpdateItem, UpdateReaction, UpdateComment, MessageReaction, MessageComment, NotificationPreferences } from '@/types';
import { defaultAppearanceSettings, defaultNotificationPreferences } from '@/types';
import { demoChats } from '@/lib/demo';
import { generateMacroId, localId } from '@/lib/id';
import { ensureAnonymousSession, getSupabaseAccessToken, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { connectCallSignaling, disconnectCallSignaling, getCallSocket, updateCallHandlers } from '@/lib/calls';
import { getIceServers, getWebRTC } from '@/lib/webrtc';
import { defaultPrivacySettings, readPrivacySettings, writePrivacySettings, type BlockedContact, type PrivacySettings } from '@/lib/privacy';
import {
  clearE2EEPassphrase,
  decryptTextWithPassphrase,
  encryptTextWithPassphrase,
  readE2EEPassphrase,
  verifyE2EEPassphrase,
  writeE2EEPassphrase,
} from '@/lib/e2ee';
import { encryptCallSignaling, decryptCallSignaling } from '@/lib/e2ee-calls';
import { initializeE2EEProService, type E2EEProService } from '@/lib/e2ee-pro-service';
import { triggerNotification, requestNotificationPermission, getCategoryFromMessage, stopCallAlert } from '@/lib/notifications';
import { configureNotificationChannels, registerPushToken } from '@/lib/push';
import { useChatActivity } from '@/lib/useChatActivity';

const PROFILE_KEY = 'macrochat.profile';
const DEVICE_ID_KEY = 'macrochat.device_id';
const APPEARANCE_KEY = 'macrochat.appearance';

export type DeviceKind = 'mobile' | 'desktop' | 'web';
export type ChatActivityState = 'typing' | 'recording' | 'screenshot';

type AppContextValue = {
  profile: Profile | null;
  loading: boolean;
  chats: Chat[];
  activityByChat: Record<string, { state: ChatActivityState; userId: string }>;
  presenceByUser: Record<string, { device?: DeviceKind; onlineAt: string; status: ProfileStatus }>;
  backendMode: 'demo' | 'supabase';
  signalingReady: boolean;
  signalingEnabled: boolean;
  activeCall: ActiveCall | null;
  mfaAal2: boolean;
  e2eeEnabled: boolean;
  e2eePro: E2EEProService | null;
  privacySettings: PrivacySettings;
  appearanceSettings: AppearanceSettings;
  blockedContacts: BlockedContact[];
  fakeDeviceStatus: 'mobile' | 'desktop' | 'web' | null;
  notificationPrefs: NotificationPreferences;
  register: (displayName: string) => Promise<Profile>;
  restoreProfile: () => Promise<Profile | null>;
  updateProfilePicture: (avatarUrl: string | null) => Promise<void>;
  updateProfileStatus: (status: ProfileStatus) => Promise<void>;
  updateProfileDisplayName: (displayName: string) => Promise<void>;
  setChatDisappearingTimer: (chatId: string, seconds: number | null) => void;
  signOut: () => Promise<void>;
  refreshSecurityState: () => Promise<void>;
  enableE2EE: (passphrase: string) => Promise<void>;
  disableE2EE: () => Promise<void>;
  unlockE2EE: (passphrase: string) => Promise<boolean>;
  updatePrivacySetting: <Key extends keyof PrivacySettings>(key: Key, value: PrivacySettings[Key]) => Promise<void>;
  updateAppearanceSettings: (next: Partial<AppearanceSettings> | ((current: AppearanceSettings) => AppearanceSettings)) => Promise<void>;
  updateFakeDeviceStatus: (status: 'mobile' | 'desktop' | 'web' | null) => Promise<void>;
  updateNotificationPrefs: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  blockContact: (userId: string) => Promise<void>;
  unblockContact: (userId: string) => Promise<void>;
  sendMessage: (chatId: string, text: string, replyTo?: string, options?: { textColor?: string; fontStyle?: 'normal' | 'italic'; fontFamily?: string }) => void;
  pinChat: (chatId: string) => void;
  muteChat: (chatId: string) => void;
  markChatUnread: (chatId: string) => void;
  clearChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  sendMediaMessage: (chatId: string, input: {
    kind: Exclude<MessageKind, 'text' | 'system'>;
    uri: string;
    fileName?: string;
    mimeType?: string;
    durationMs?: number;
    replyTo?: string;
  }) => Promise<void>;
  sendChatActivity: (chatId: string, state: ChatActivityState | null) => void;
  addChat: (macroId: string) => Promise<string>;
  markRead: (chatId: string) => void;
  refreshChats: () => Promise<void>;
  startAudioCall: (chatId: string) => Promise<void>;
  startVideoCall: (chatId: string) => Promise<void>;
  acceptIncomingCall: () => void;
  rejectIncomingCall: () => void;
  endActiveCall: () => void;
  localCallStream: MediaStream | null;
  remoteCallStream: MediaStream | null;
  callStartedAt: number | null;
  mediaConnected: boolean;
  callHistory: CallHistoryEntry[];
  refreshCallHistory: () => Promise<void>;
  updates: UpdateItem[];
  refreshUpdates: () => Promise<void>;
  postUpdate: (input: { kind: 'photo' | 'video' | 'text'; uri?: string; caption?: string }) => Promise<void>;
  markUpdateViewed: (updateId: string) => Promise<void>;
  deleteUpdate: (updateId: string) => Promise<void>;
  updateReactions: Record<string, UpdateReaction[]>;
  updateComments: Record<string, UpdateComment[]>;
  postUpdateReaction: (updateId: string, emoji: string) => Promise<void>;
  removeUpdateReaction: (reactionId: string) => Promise<void>;
  postUpdateComment: (updateId: string, text: string) => Promise<void>;
  removeUpdateComment: (commentId: string) => Promise<void>;
  messageReactions: Record<string, MessageReaction[]>;
  messageComments: Record<string, MessageComment[]>;
  postMessageReaction: (messageId: string, emoji: string) => Promise<void>;
  removeMessageReaction: (reactionId: string) => Promise<void>;
  postMessageComment: (messageId: string, text: string) => Promise<void>;
  removeMessageComment: (commentId: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => void;
  editMessage: (chatId: string, messageId: string, newText: string) => void;
  toggleMessagePin: (chatId: string, messageId: string) => void;
  toggleMessageStar: (chatId: string, messageId: string) => void;
  logChatSystemMessage: (chatId: string, text: string) => void;
};

type ActiveCallStatus = 'dialing' | 'ringing' | 'connected';

type ActiveCall = {
  callId: string;
  conversationId: string;
  peerUserId: string;
  incoming: boolean;
  video: boolean;
  status: ActiveCallStatus;
};

type ConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  role: 'member' | 'admin';
  last_read_at: string | null;
  receipt_read_at: string | null;
  macrochat_profiles: {
    id: string;
    macro_id: string;
    display_name: string;
    avatar_color: string;
    avatar_url?: string | null;
    last_seen: string;
  } | null;
};

type MessageRow = {
  id: string;
  client_id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: MessageKind;
  media_path: string | null;
  body_ciphertext: string | null;
  body_nonce: string | null;
  encryption_version: string | null;
  reply_to: string | null;
  pinned_at: string | null;
  starred_by_user_id: string | null;
  created_at: string;
  expires_at: string | null;
  text_color?: string | null;
  font_style?: string | null;
  font_family?: string | null;
};

type DbErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

const getMessageReactionKey = (messageId: string, userId: string, emoji: string) => `${messageId}::${userId}::${emoji}`;

const parseMessageReactionKey = (reactionId: string) => {
  const parts = reactionId.split('::');
  if (parts.length >= 3) {
    const [messageId, userId, ...emojiParts] = parts;
    return {
      messageId,
      userId,
      emoji: emojiParts.join('::'),
    };
  }
  return null;
};

function toReadableDbError(step: string, error: DbErrorLike | null | undefined) {
  const message = (error?.message || '').trim();
  const lowered = message.toLowerCase();
  if (
    lowered.includes('network request failed')
    || lowered.includes('failed to fetch')
    || lowered.includes('network error')
    || lowered.includes('fetch failed')
  ) {
    return new Error(`${step}: Network request failed. Check internet access on both devices and verify EXPO_PUBLIC_SUPABASE_URL is reachable.`);
  }

  if (error?.code === '42501' || lowered.includes('row-level security') || lowered.includes('permission denied')) {
    return new Error(`${step}: The database rejected this action for your account. Run supabase/fix-aal2-conversation-403.sql, then sign out and back in.`);
  }

  const parts = [message || 'Unknown database error'];
  if (error?.code) parts.push(`code=${error.code}`);
  if (error?.details) parts.push(error.details);
  if (error?.hint) parts.push(`hint=${error.hint}`);
  return new Error(`${step}: ${parts.join(' | ')}`);
}

type AccessTokenClaims = {
  sub?: string;
  role?: string;
  aal?: string;
  exp?: number;
  is_anonymous?: boolean;
};

// Decodes the JWT payload locally so RLS rejections can be traced to the actual claims sent.
async function readAccessTokenClaims(supabaseClient: NonNullable<typeof supabase>): Promise<AccessTokenClaims | null> {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')));
  } catch {
    return null;
  }
}

async function getAuthenticatedUserId(supabaseClient: NonNullable<typeof supabase>) {
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw toReadableDbError('Checking current session failed', sessionError);

  let user = sessionData.session?.user ?? null;
  if (!user) {
    const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
    if (refreshError) throw toReadableDbError('Refreshing session failed', refreshError);
    user = refreshData.session?.user ?? null;
  }

  if (!user) {
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw toReadableDbError('Resolving active account failed', userError);
    user = userData.user ?? null;
  }

  if (!user) throw new Error('Your session is no longer valid. Please sign in again.');
  return user.id;
}

function parseMediaBody(body: string | null | undefined): {
  name?: string;
  durationMs?: number;
  mimeType?: string;
  dataUrl?: string;
  signedUrl?: string;
  textColor?: string;
  fontStyle?: 'normal' | 'italic';
  fontFamily?: string;
  callInfo?: { video: boolean; outcome: string; durationSeconds?: number };
  text?: string;
} {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : undefined,
        mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : undefined,
        dataUrl: typeof parsed.dataUrl === 'string' ? parsed.dataUrl : undefined,
        signedUrl: typeof parsed.signedUrl === 'string' ? parsed.signedUrl : undefined,
        textColor: typeof parsed.textColor === 'string' ? parsed.textColor : undefined,
        fontStyle: parsed.fontStyle === 'normal' || parsed.fontStyle === 'italic' ? parsed.fontStyle : undefined,
        fontFamily: typeof parsed.fontFamily === 'string' ? parsed.fontFamily : undefined,
        callInfo: parsed.callInfo,
        text: typeof parsed.text === 'string' ? parsed.text : undefined,
      };
    }
  } catch {
    // Plain string body
  }
  return {};
}

function inferExtension(fileName?: string, mimeType?: string) {
  if (fileName && fileName.includes('.')) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext) return ext;
  }

  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
  };
  return (mimeType && byMime[mimeType]) || 'bin';
}

function base64ToUint8Array(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function readUriAsUploadBody(uri: string) {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.blob();
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  return base64ToUint8Array(base64);
}

async function ensurePortableDataUrl(uri: string, mimeType?: string): Promise<string> {
  if (!uri || uri.startsWith('data:') || uri.startsWith('blob:')) return uri;  // Blob URLs can't be fetched; return as-is
  if (Platform.OS === 'web') {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      return await blobToBase64(blob);
    } catch (e) {
      console.warn('ensurePortableDataUrl web failed:', e);
      return uri;
    }
  } else {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const type = mimeType || 'application/octet-stream';
      return `data:${type};base64,${base64}`;
    } catch (e) {
      console.warn('ensurePortableDataUrl native failed:', e);
      return uri;
    }
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const AppContext = createContext<AppContextValue | null>(null);

async function readProfileFromStorage() {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(PROFILE_KEY) : null;
  }
  return SecureStore.getItemAsync(PROFILE_KEY);
}

async function writeProfileToStorage(profile: Profile) {
  const serialized = JSON.stringify(profile);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PROFILE_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(PROFILE_KEY, serialized);
}

async function clearProfileFromStorage() {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(PROFILE_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}

async function readAppearanceSettingsFromStorage(): Promise<AppearanceSettings> {
  const fallback = defaultAppearanceSettings;
  try {
    const saved = Platform.OS === 'web'
      ? (typeof localStorage !== 'undefined' ? localStorage.getItem(APPEARANCE_KEY) : null)
      : await SecureStore.getItemAsync(APPEARANCE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<AppearanceSettings>;
    return {
      textSize: parsed.textSize === 'compact' || parsed.textSize === 'comfortable' || parsed.textSize === 'large' || parsed.textSize === 'xl' ? parsed.textSize : fallback.textSize,
      wallpaper: parsed.wallpaper === 'midnight' || parsed.wallpaper === 'obsidian' || parsed.wallpaper === 'aurora' || parsed.wallpaper === 'graphite' ? parsed.wallpaper : fallback.wallpaper,
      fontFamily: parsed.fontFamily === 'system' || parsed.fontFamily === 'figtree' || parsed.fontFamily === 'space-grotesk' || parsed.fontFamily === 'instrument-serif' || parsed.fontFamily === 'oswald' || parsed.fontFamily === 'dancing-script' ? parsed.fontFamily : fallback.fontFamily,
    };
  } catch {
    return fallback;
  }
}

async function writeAppearanceSettingsToStorage(settings: AppearanceSettings) {
  const serialized = JSON.stringify(settings);
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(APPEARANCE_KEY, serialized);
    return;
  }
  await SecureStore.setItemAsync(APPEARANCE_KEY, serialized);
}

// Device ID management for E2EE Pro
async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_ID_KEY) : null;
    if (stored) return stored;
    const deviceId = localId('device');
    if (typeof localStorage !== 'undefined') localStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  }
  try {
    const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (stored) return stored;
    const deviceId = localId('device');
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch (e) {
    // SecureStore failed (mobile web), fallback to localStorage
    console.warn('SecureStore unavailable, using localStorage fallback', e);
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_ID_KEY) : null;
    if (stored) return stored;
    const deviceId = localId('device');
    if (typeof localStorage !== 'undefined') localStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  }
}

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [signalingReady, setSignalingReady] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStream, setRemoteCallStream] = useState<MediaStream | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [mediaConnected, setMediaConnected] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<string[]>([]);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const [callHistory, setCallHistory] = useState<CallHistoryEntry[]>([]);
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [updateReactions, setUpdateReactions] = useState<Record<string, UpdateReaction[]>>({});
  const [updateComments, setUpdateComments] = useState<Record<string, UpdateComment[]>>({});
  const [messageReactions, setMessageReactions] = useState<Record<string, MessageReaction[]>>({});
  const [messageComments, setMessageComments] = useState<Record<string, MessageComment[]>>({});
  const [mfaAal2, setMfaAal2] = useState(false);
  const [e2eePro, setE2eePro] = useState<E2EEProService | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const e2eeProUserIdRef = useRef<string | null>(null);
  const [e2eePassphrase, setE2eePassphrase] = useState<string | null>(null);
  const [privacySettings, setPrivacySettings] = useState(defaultPrivacySettings);
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>(defaultAppearanceSettings);
  const [blockedContacts, setBlockedContacts] = useState<BlockedContact[]>([]);
  const [fakeDeviceStatus, setFakeDeviceStatus] = useState<'mobile' | 'desktop' | 'web' | null>(null);
  const { activityByChat, presenceByUser, sendChatActivity } = useChatActivity(chats, profile, privacySettings.showDeviceStatus, fakeDeviceStatus, privacySettings.shareTypingActivity);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const notificationPrefsRef = useRef(notificationPrefs);
  useEffect(() => { notificationPrefsRef.current = notificationPrefs; }, [notificationPrefs]);

  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(new Set());
  const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(new Set());
  const [clearedChatIds, setClearedChatIds] = useState<Set<string>>(new Set());
  const [deletedChatIds, setDeletedChatIds] = useState<Set<string>>(new Set());

  const pinnedChatIdsRef = useRef(pinnedChatIds);
  const mutedChatIdsRef = useRef(mutedChatIds);
  const clearedChatIdsRef = useRef(clearedChatIds);
  const deletedChatIdsRef = useRef(deletedChatIds);

  useEffect(() => { pinnedChatIdsRef.current = pinnedChatIds; }, [pinnedChatIds]);
  useEffect(() => { mutedChatIdsRef.current = mutedChatIds; }, [mutedChatIds]);
  useEffect(() => { clearedChatIdsRef.current = clearedChatIds; }, [clearedChatIds]);
  useEffect(() => { deletedChatIdsRef.current = deletedChatIds; }, [deletedChatIds]);
  
  // Periodically remove expired messages
  useEffect(() => {
    const interval = setInterval(() => {
      setChats((current) => current.map((chat) => ({
        ...chat,
        messages: chat.messages.filter((msg) => !msg.expiresAt || new Date(msg.expiresAt).getTime() > Date.now()),
      })));
    }, 1000); // Check every second
    return () => clearInterval(interval);
  }, []);
  const signalingUrl = process.env.EXPO_PUBLIC_SIGNALING_URL;
  const signalingEnabled = Boolean(signalingUrl);

  const restoreProfile = useCallback(async () => {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('macrochat_profiles')
      .select('id,macro_id,display_name,avatar_color,avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw toReadableDbError('Restoring account profile failed', error);
    if (!data) return null;

    const restored: Profile = {
      id: data.id,
      macroId: data.macro_id,
      displayName: data.display_name,
      avatarColor: data.avatar_color,
      avatarUrl: (data as { avatar_url?: string | null }).avatar_url ?? undefined,
      status: (data as { status?: ProfileStatus } | null)?.status ?? 'online',
    };
    await writeProfileToStorage(restored);
    setProfile(restored);
    return restored;
  }, []);

  const refreshSecurityState = useCallback(async () => {
    const localPassphrase = await readE2EEPassphrase();
    setE2eePassphrase(localPassphrase);

    if (!supabase) {
      setMfaAal2(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error) {
        setMfaAal2(data.currentLevel === 'aal2');
      }
    } catch {
      // Fallback below
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const aal = sessionData.session?.user?.app_metadata?.aal ?? sessionData.session?.user?.user_metadata?.aal;
    setMfaAal2(aal === 'aal2');

    // Initialize E2EE Pro service
    try {
      const userId = sessionData.session?.user.id;
      // Re-runs when the signed-in user changes, otherwise a second account in the
      // same session never publishes its X3DH key bundle.
      if (userId && e2eeProUserIdRef.current !== userId) {
        const deviceId = deviceIdRef.current ?? await getOrCreateDeviceId();
        deviceIdRef.current = deviceId;
        const service = initializeE2EEProService(userId, deviceId);
        await service.initialize();
        e2eeProUserIdRef.current = userId;
        setE2eePro(service);
      }
    } catch (error) {
      // Silently fail in production
    }
  }, []);

  const refreshPrivacyState = useCallback(async () => {
    const local = await readPrivacySettings();
    if (!supabase || !profile) {
      setPrivacySettings(local);
      setBlockedContacts([]);
      return;
    }

    const [privacyResult, blockedResult] = await Promise.all([
      supabase
        .from('macrochat_user_privacy')
        .select('read_receipts,share_typing_activity,allow_incoming_calls,show_device_status,default_message_ttl_seconds')
        .eq('user_id', profile.id)
        .maybeSingle(),
      supabase.rpc('macrochat_list_blocked_users'),
    ]);

    if (!privacyResult.error && privacyResult.data) {
      const synced: PrivacySettings = {
        readReceipts: privacyResult.data.read_receipts,
        shareTypingActivity: privacyResult.data.share_typing_activity,
        allowIncomingCalls: privacyResult.data.allow_incoming_calls,
        showDeviceStatus: privacyResult.data.show_device_status ?? true,
        defaultMessageTtlSeconds: privacyResult.data.default_message_ttl_seconds,
      };
      setPrivacySettings(synced);
      await writePrivacySettings(synced);
    } else {
      setPrivacySettings(local);
    }

    if (!blockedResult.error) {
      setBlockedContacts(((blockedResult.data ?? []) as { id: string; macro_id: string; display_name: string; avatar_color: string }[]).map((contact) => ({
        id: contact.id,
        macroId: contact.macro_id,
        displayName: contact.display_name,
        avatarColor: contact.avatar_color,
      })));
    }
  }, [profile]);

  const refreshMessageReactions = useCallback(async () => {
    if (!supabase || !profile) {
      setMessageReactions({});
      return;
    }

    const { data, error } = await supabase
      .from('macrochat_message_reactions')
      .select('message_id,user_id,emoji,created_at,macrochat_profiles(display_name)')
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Failed to load message reactions', error.message);
      return;
    }

    const grouped: Record<string, MessageReaction[]> = {};
    for (const row of data ?? []) {
      const messageId = row.message_id as string;
      const profileData = row.macrochat_profiles as { display_name?: string } | null;
      const reactionKey = getMessageReactionKey(messageId, row.user_id as string, row.emoji as string);
      const reaction: MessageReaction = {
        id: reactionKey,
        messageId,
        userId: row.user_id,
        userDisplayName: profileData?.display_name ?? (row.user_id === profile.id ? profile.displayName : 'Contact'),
        emoji: row.emoji,
        createdAt: row.created_at,
      };
      grouped[messageId] = [...(grouped[messageId] ?? []), reaction];
    }

    setMessageReactions(grouped);
  }, [profile]);

  const refreshCallHistory = useCallback(async () => {
    if (!supabase || !profile) {
      setCallHistory([]);
      return;
    }
    const { data, error } = await supabase
      .from('macrochat_call_history')
      .select('call_id,conversation_id,caller_id,callee_id,video,outcome,duration_seconds,started_at')
      .or(`caller_id.eq.${profile.id},callee_id.eq.${profile.id}`)
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('Failed to load call history', error.message);
      return;
    }
    setCallHistory((data ?? []).map((row) => {
      const incoming = row.callee_id === profile.id;
      const peerUserId = incoming ? row.caller_id : row.callee_id;
      return {
        id: row.call_id,
        conversationId: row.conversation_id,
        peerUserId,
        video: row.video,
        incoming,
        outcome: row.outcome,
        durationSeconds: row.duration_seconds,
        startedAt: row.started_at,
      };
    }));
  }, [profile]);

  const refreshUpdates = useCallback(async () => {
    if (!supabase || !profile) {
      setUpdates([]);
      return;
    }
    const { data, error } = await supabase
      .from('macrochat_updates')
      .select('id,user_id,kind,media_data,caption,created_at,expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Failed to load updates', error.message);
      return;
    }

    const rows = (data ?? []) as unknown as {
      id: string;
      user_id: string;
      kind: 'photo' | 'video' | 'text';
      media_data: string | null;
      caption: string | null;
      created_at: string;
      expires_at: string;
    }[];

    // Fetch profile info for each update user
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    let profilesByUserId = new Map<string, { display_name: string; avatar_color: string }>();
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from('macrochat_profiles')
        .select('id,display_name,avatar_color')
        .in('id', userIds);
      if (profileData) {
        profilesByUserId = new Map(
          profileData.map((p: { id: string; display_name: string; avatar_color: string }) => [p.id, { display_name: p.display_name, avatar_color: p.avatar_color }])
        );
      }
    }

    const viewedResult = await supabase
      .from('macrochat_update_views')
      .select('update_id')
      .eq('viewer_id', profile.id)
      .in('update_id', rows.map((row) => row.id));
    const viewedIds = new Set((viewedResult.data ?? []).map((row) => row.update_id as string));

    setUpdates(rows.map((row) => {
      const profileInfo = profilesByUserId.get(row.user_id);
      // media_data is already a data URL from blobToBase64 (e.g. "data:image/jpeg;base64,...")
      const mediaUrl = row.media_data && (row.media_data.startsWith('data:') || row.media_data.startsWith('blob:')) ? row.media_data : undefined;
      return {
        id: row.id,
        userId: row.user_id,
        name: row.user_id === profile.id ? 'My update' : (profileInfo?.display_name || 'Contact'),
        avatarColor: profileInfo?.avatar_color || '#55B9FF',
        kind: row.kind,
        mediaUrl,
        caption: row.caption ?? undefined,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        viewed: viewedIds.has(row.id),
        mine: row.user_id === profile.id,
      };
    }));
  }, [profile]);

  const postUpdate = useCallback(async (input: { kind: 'photo' | 'video' | 'text'; uri?: string; caption?: string }) => {
    if (!supabase || !profile) throw new Error('Posting an update requires an online account.');

    let mediaData: string | null = null;
    if (input.uri) {
      const blob = await readUriAsUploadBody(input.uri);
      
      if (blob instanceof Blob) {
        mediaData = await blobToBase64(blob);
      } else {
        throw new Error('Unsupported platform for media upload');
      }
    }

    const { error } = await supabase.from('macrochat_updates').insert({
      user_id: profile.id,
      kind: input.kind,
      media_data: mediaData,
      caption: input.caption,
    });
    if (error) {
      throw toReadableDbError('Posting update failed', error);
    }

    await refreshUpdates();
  }, [profile, refreshUpdates]);

  const markUpdateViewed = useCallback(async (updateId: string) => {
    if (!supabase || !profile) return;
    const { error } = await supabase.from('macrochat_update_views').upsert({
      update_id: updateId,
      viewer_id: profile.id,
    }, { onConflict: 'update_id,viewer_id' });
    if (error) {
      console.warn('Failed to mark update viewed', error.message);
      return;
    }
    setUpdates((current) => current.map((item) => item.id === updateId ? { ...item, viewed: true } : item));
  }, [profile]);

  const deleteUpdate = useCallback(async (updateId: string) => {
    if (!supabase || !profile) return;
    const { error } = await supabase.from('macrochat_updates').delete().eq('id', updateId).eq('user_id', profile.id);
    if (error) {
      throw toReadableDbError('Failed to delete update', error);
    }
    setUpdates((current) => current.filter((item) => item.id !== updateId));
  }, [profile]);

  const postUpdateReaction = useCallback(async (updateId: string, emoji: string) => {
    if (!supabase || !profile) throw new Error('Posting a reaction requires an online account.');
    const { data, error } = await supabase.from('macrochat_update_reactions').upsert({
      update_id: updateId,
      user_id: profile.id,
      emoji,
    }, { onConflict: 'update_id,user_id,emoji' }).select() as { data: any[] | null; error: any };
    if (error) throw error;
    const reaction = data?.[0];
    if (reaction) {
      setUpdateReactions((current) => ({
        ...current,
        [updateId]: [...(current[updateId] ?? []).filter((r) => r.emoji !== emoji), {
          id: reaction.id,
          updateId,
          userId: profile.id,
          userDisplayName: profile.displayName,
          emoji,
          createdAt: reaction.created_at,
        }],
      }));
    }
  }, [profile]);

  const removeUpdateReaction = useCallback(async (reactionId: string) => {
    if (!supabase) return;
    await supabase.from('macrochat_update_reactions').delete().eq('id', reactionId);
    setUpdateReactions((current) => {
      const next = { ...current };
      for (const updateId in next) {
        next[updateId] = next[updateId].filter((r) => r.id !== reactionId);
      }
      return next;
    });
  }, []);

  const postUpdateComment = useCallback(async (updateId: string, text: string) => {
    if (!supabase || !profile) throw new Error('Posting a comment requires an online account.');
    const { data, error } = await supabase.from('macrochat_update_comments').insert({
      update_id: updateId,
      user_id: profile.id,
      text,
    }).select();
    if (error) throw error;
    const comment = data?.[0];
    if (comment) {
      setUpdateComments((current) => ({
        ...current,
        [updateId]: [...(current[updateId] ?? []), {
          id: comment.id,
          updateId,
          userId: profile.id,
          userDisplayName: profile.displayName,
          text,
          createdAt: comment.created_at,
        }],
      }));
    }
  }, [profile]);

  const removeUpdateComment = useCallback(async (commentId: string) => {
    if (!supabase) return;
    await supabase.from('macrochat_update_comments').delete().eq('id', commentId);
    setUpdateComments((current) => {
      const next = { ...current };
      for (const updateId in next) {
        next[updateId] = next[updateId].filter((c) => c.id !== commentId);
      }
      return next;
    });
  }, []);

  const postMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!profile) return;

    // Validate that messageId is a real UUID (not a local optimistic ID)
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);
    if (!isValidUuid) {
      console.warn('Skipping reaction on unsync\'d message:', messageId);
      return;  // Silently return instead of throwing
    }

    const reactionKey = getMessageReactionKey(messageId, profile.id, emoji);
    const optimisticReaction = {
      id: reactionKey,
      messageId,
      userId: profile.id,
      userDisplayName: profile.displayName,
      emoji,
      createdAt: new Date().toISOString(),
    };

    setMessageReactions((current) => ({
      ...current,
      [messageId]: [...(current[messageId] ?? []).filter((r) => r.emoji !== emoji), optimisticReaction],
    }));

    if (!supabase) return;

    const { data, error } = await supabase.from('macrochat_message_reactions').upsert({
      message_id: messageId,
      user_id: profile.id,
      emoji,
    }, { onConflict: 'message_id,user_id' }).select('message_id,user_id,emoji,created_at') as { data: any[] | null; error: any };
    if (error) throw error;
    const reaction = data?.[0];
    if (reaction) {
      const finalKey = getMessageReactionKey(reaction.message_id, reaction.user_id, reaction.emoji);
      setMessageReactions((current) => ({
        ...current,
        [messageId]: [...(current[messageId] ?? []).filter((r) => r.emoji !== emoji), {
          id: finalKey,
          messageId,
          userId: profile.id,
          userDisplayName: profile.displayName,
          emoji,
          createdAt: reaction.created_at,
        }],
      }));
    }
  }, [profile]);

  const removeMessageReaction = useCallback(async (reactionId: string) => {
    const parsed = parseMessageReactionKey(reactionId);

    if (!supabase) {
      setMessageReactions((current) => {
        const next = { ...current };
        for (const messageId in next) {
          next[messageId] = next[messageId].filter((r) => r.id !== reactionId);
        }
        return next;
      });
      return;
    }

    if (parsed) {
      await supabase
        .from('macrochat_message_reactions')
        .delete()
        .eq('message_id', parsed.messageId)
        .eq('user_id', parsed.userId)
        .eq('emoji', parsed.emoji);
    } else {
      await supabase.from('macrochat_message_reactions').delete().eq('id', reactionId);
    }

    setMessageReactions((current) => {
      const next = { ...current };
      for (const messageId in next) {
        next[messageId] = next[messageId].filter((r) => r.id !== reactionId);
      }
      return next;
    });
  }, []);

  const postMessageComment = useCallback(async (messageId: string, text: string) => {
    if (!supabase || !profile) throw new Error('Posting a comment requires an online account.');
    const { data, error } = await supabase.from('macrochat_message_comments').insert({
      message_id: messageId,
      user_id: profile.id,
      text,
    }).select();
    if (error) throw error;
    const comment = data?.[0];
    if (comment) {
      setMessageComments((current) => ({
        ...current,
        [messageId]: [...(current[messageId] ?? []), {
          id: comment.id,
          messageId,
          userId: profile.id,
          userDisplayName: profile.displayName,
          text,
          createdAt: comment.created_at,
        }],
      }));
    }
  }, [profile]);

  const removeMessageComment = useCallback(async (commentId: string) => {
    if (!supabase) return;
    await supabase.from('macrochat_message_comments').delete().eq('id', commentId);
    setMessageComments((current) => {
      const next = { ...current };
      for (const messageId in next) {
        next[messageId] = next[messageId].filter((c) => c.id !== commentId);
      }
      return next;
    });
  }, []);

  const refreshCallHistoryRef = useRef(refreshCallHistory);
  useEffect(() => {
    refreshCallHistoryRef.current = refreshCallHistory;
  }, [refreshCallHistory]);

  useEffect(() => {
    refreshCallHistory().catch(() => undefined);
  }, [refreshCallHistory]);

  useEffect(() => {
    refreshUpdates().catch(() => undefined);
  }, [refreshUpdates]);

  const loadChatsFromBackend = useCallback(async () => {
    if (!supabase || !profile) return;

    if (e2eePro) {
      try {
        await e2eePro.loadActiveSessions();
      } catch (e) {
        console.warn('Failed to refresh E2EE sessions:', e);
      }
    }

    const actorUserId = await getAuthenticatedUserId(supabase);

    const memberRes = await supabase
      .from('macrochat_conversation_members')
      .select('conversation_id,last_read_at')
      .eq('user_id', actorUserId);

    if (memberRes.error) {
      console.warn('Failed to load memberships', memberRes.error.message);
      return;
    }

    const membershipRows = memberRes.data ?? [];
    const conversationIds = membershipRows.map((row) => row.conversation_id);
    if (conversationIds.length === 0) {
      setChats([]);
      return;
    }

    const baseMessageSelect = 'id,client_id,conversation_id,sender_id,body,kind,media_path,body_ciphertext,body_nonce,encryption_version,reply_to,created_at,expires_at';
    const fullMessageSelect = `${baseMessageSelect},pinned_at,starred_by_user_id,text_color,font_style,font_family`;
    const [conversationsRes, conversationMembersRes, messagesRes] = await Promise.all([
      supabase
        .from('macrochat_conversations')
        .select('id,title,is_group,updated_at,message_ttl_seconds')
        .in('id', conversationIds),
      supabase
        .from('macrochat_conversation_members')
        .select('conversation_id,user_id,role,last_read_at,receipt_read_at,macrochat_profiles(id,macro_id,display_name,avatar_color,avatar_url,last_seen)')
        .in('conversation_id', conversationIds),
      supabase
        .from('macrochat_messages')
        .select(baseMessageSelect)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true }),
    ]);

    let resolvedMessagesRes: { data: MessageRow[] | null; error: DbErrorLike | null } = messagesRes as any;
    if (messagesRes.error && /pinned_at|starred_by_user_id|text_color|font_style|font_family|column .* does not exist/i.test(messagesRes.error.message)) {
      const extendedRes = await supabase
        .from('macrochat_messages')
        .select(fullMessageSelect)
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true });
      if (!extendedRes.error) {
        resolvedMessagesRes = extendedRes as any;
      }
    }

    if (conversationsRes.error || conversationMembersRes.error || resolvedMessagesRes.error) {
      console.warn('Failed to load conversations/messages', { conversation: conversationsRes.error?.message, memberships: conversationMembersRes.error?.message, messages: resolvedMessagesRes.error?.message });
      return;
    }

    const members = (conversationMembersRes.data ?? []) as unknown as ConversationMemberRow[];
    const messages = (resolvedMessagesRes.data ?? []) as MessageRow[];
    const mediaPaths = [...new Set(messages.map((row) => row.media_path).filter((path): path is string => typeof path === 'string' && Boolean(path) && !path.startsWith('data:')))];
    const signedByPath = new Map<string, string>();

    if (mediaPaths.length > 0) {
      const signedRes = await supabase.storage.from('macrochat-media').createSignedUrls(mediaPaths, 60 * 5);
      if (!signedRes.error && signedRes.data) {
        mediaPaths.forEach((path, index) => {
          const signedUrl = signedRes.data?.[index]?.signedUrl;
          if (signedUrl) signedByPath.set(path, signedUrl);
        });
      }
    }

    const membershipByConversation = new Map(membershipRows.map((row) => [row.conversation_id, row.last_read_at]));

    const builtChats: Chat[] = (conversationsRes.data ?? []).map((conversation) => {
      const conversationMembers = members.filter((row) => row.conversation_id === conversation.id);
      const other = conversationMembers.find((row) => row.user_id !== actorUserId);
      const otherReceiptReadAt = other?.receipt_read_at;
      const myLastReadAt = membershipByConversation.get(conversation.id);

      const mappedMessages: Message[] = clearedChatIdsRef.current.has(conversation.id)
        ? []
        : messages
            .filter((row) => row.conversation_id === conversation.id)
            .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())
            .map((row) => {
          const mediaMeta = parseMediaBody(row.body);
          const encrypted = Boolean(row.body_ciphertext && row.body_nonce && row.encryption_version);
          let displayText = mediaMeta.text || row.body;
          if (encrypted) {
            let decryptedText: string | null = null;
            if (row.body_ciphertext && row.body_nonce) {
              if (e2eePassphrase) {
                decryptedText = decryptTextWithPassphrase(row.body_ciphertext, row.body_nonce, e2eePassphrase);
              }
              if (!decryptedText && e2eePro) {
                const peerUserId = row.sender_id === actorUserId ? other?.user_id : row.sender_id;
                if (peerUserId) {
                  decryptedText = e2eePro.decryptCiphertextSync(row.body_ciphertext, row.body_nonce, peerUserId);
                }
              }
            }
            if (decryptedText) {
              displayText = decryptedText;
            } else if (row.body && !/^\[encrypted/i.test(row.body)) {
              displayText = row.body;
            } else if (row.encryption_version === 'mc-e2ee-v2-pro') {
              displayText = '[Encrypted with E2EE Pro]';
            } else {
              displayText = '[Encrypted message]';
            }
          } else if (row.kind !== 'text' && row.kind !== 'system' && row.kind !== 'call') {
            displayText = mediaMeta.name || mediaMeta.text || row.body || row.kind;
          }

          const fontStyle: 'normal' | 'italic' | undefined =
            row.font_style === 'italic' || row.font_style === 'normal'
              ? row.font_style
              : mediaMeta.fontStyle === 'italic' || mediaMeta.fontStyle === 'normal'
                ? mediaMeta.fontStyle
                : undefined;

          return {
            id: row.id,
            clientId: row.client_id ?? undefined,
            chatId: row.conversation_id,
            senderId: row.sender_id === actorUserId ? 'me' : row.sender_id,
            text: displayText,
            kind: row.kind,
            mediaPath: row.media_path ?? undefined,
            mediaUrl: mediaMeta.signedUrl || mediaMeta.dataUrl || (row.media_path ? (row.media_path.startsWith('data:') ? row.media_path : signedByPath.get(row.media_path)) : undefined),
            fileName: mediaMeta.name,
            mimeType: mediaMeta.mimeType,
            durationMs: mediaMeta.durationMs,
            textColor: row.text_color || mediaMeta.textColor,
            fontStyle,
            fontFamily: row.font_family || mediaMeta.fontFamily,
            callInfo: mediaMeta.callInfo,
            encrypted,
            encryptionVersion: row.encryption_version ?? undefined,
            ciphertext: row.body_ciphertext ?? undefined,
            nonce: row.body_nonce ?? undefined,
            createdAt: row.created_at,
            status: !conversation.is_group && row.sender_id === actorUserId && otherReceiptReadAt && new Date(otherReceiptReadAt).getTime() >= new Date(row.created_at).getTime() ? 'read' : row.sender_id === actorUserId ? 'sent' : 'delivered',
            replyTo: row.reply_to ?? undefined,
            pinned: Boolean(row.pinned_at),
            starred: Boolean(row.starred_by_user_id) && row.starred_by_user_id === actorUserId,
            expiresAt: row.expires_at ?? undefined,
          };
        });

      const unread = mappedMessages.filter((message) => {
        if (message.senderId === 'me') return false;
        if (!myLastReadAt) return true;
        return new Date(message.createdAt).getTime() > new Date(myLastReadAt).getTime();
      }).length;

      const getLastSeenText = () => {
        if (!other?.macrochat_profiles?.last_seen) return conversation.is_group ? 'group conversation' : 'private contact';
        const lastSeenDate = new Date(other.macrochat_profiles.last_seen);
        const now = new Date();
        const diffMs = now.getTime() - lastSeenDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'last seen just now';
        if (diffMins < 60) return `last seen ${diffMins}m ago`;
        if (diffHours < 24) return `last seen ${diffHours}h ago`;
        if (diffDays === 1) return 'last seen yesterday';
        if (diffDays < 7) return `last seen ${diffDays}d ago`;
        return `last seen ${lastSeenDate.toLocaleDateString()}`;
      };
      const lastSeen = getLastSeenText();

      return {
        id: conversation.id,
        name: conversation.is_group
          ? (conversation.title || 'Group conversation')
          : (other?.macrochat_profiles?.display_name || other?.macrochat_profiles?.macro_id || 'Private contact'),
        macroId: conversation.is_group
          ? (conversation.title || 'GROUP')
          : (other?.macrochat_profiles?.macro_id || 'UNKNOWN'),
        participantUserId: conversation.is_group ? undefined : (other?.user_id ?? undefined),
        avatarColor: other?.macrochat_profiles?.avatar_color || '#71F79F',
        avatarUrl: other?.macrochat_profiles?.avatar_url || undefined,
        online: false,
        lastSeen,
        unread,
        isGroup: conversation.is_group,
        pinned: pinnedChatIdsRef.current.has(conversation.id),
        muted: mutedChatIdsRef.current.has(conversation.id),
        disappearingSeconds: conversation.message_ttl_seconds,
        messages: mappedMessages,
      };
    }).filter((chat) => !deletedChatIdsRef.current.has(chat.id) && (!chat.participantUserId || !blockedContacts.some((contact) => contact.id === chat.participantUserId)));

    builtChats.sort((a, b) => {
      const aMessages = a.messages && a.messages.length > 0 ? a.messages : [];
      const bMessages = b.messages && b.messages.length > 0 ? b.messages : [];
      const aLast = aMessages.length > 0 ? aMessages[aMessages.length - 1]?.createdAt : '';
      const bLast = bMessages.length > 0 ? bMessages[bMessages.length - 1]?.createdAt : '';
      const aTime = aLast ? new Date(aLast).getTime() : 0;
      const bTime = bLast ? new Date(bLast).getTime() : 0;
      return bTime - aTime;
    });

    // Update user's last_seen timestamp
    void (async () => {
      try {
        if (!supabase) return;
        await supabase
          .from('macrochat_profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', actorUserId);
      } catch (error) {
        console.warn('Failed to update last_seen:', error);
      }
    })();

    setChats((current) => {
      const pendingByConversation = new Map<string, Message[]>();
      current.forEach((chat) => {
        const pending = chat.messages.filter((message) => message.senderId === 'me' && (message.status === 'sending' || message.status === 'failed'));
        if (pending.length > 0) pendingByConversation.set(chat.id, pending);
      });

      return builtChats.map((chat) => {
        const pending = pendingByConversation.get(chat.id);
        if (!pending || pending.length === 0) return chat;

        const existingKeys = new Set(
          chat.messages.flatMap((m) => [m.id, m.clientId].filter((k): k is string => Boolean(k)))
        );
        const carryForward = pending.filter(
          (m) => !existingKeys.has(m.id) && (!m.clientId || !existingKeys.has(m.clientId))
        );
        if (carryForward.length === 0) return chat;

        const mergedMessages = [...chat.messages, ...carryForward]
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        return { ...chat, messages: mergedMessages };
      });
    });
    void refreshMessageReactions();
  }, [blockedContacts, e2eePassphrase, e2eePro, profile, refreshMessageReactions]);

  const mergeRealtimeMessage = useCallback((row: MessageRow, notify = false) => {
    if (!profile) return;

    const mediaMeta = parseMediaBody(row.body);
    const encrypted = Boolean(row.body_ciphertext && row.body_nonce && row.encryption_version);
    let displayText = mediaMeta.text || row.body;
    if (encrypted) {
      let decryptedText: string | null = null;
      if (row.body_ciphertext && row.body_nonce) {
        if (e2eePassphrase) {
          decryptedText = decryptTextWithPassphrase(row.body_ciphertext, row.body_nonce, e2eePassphrase);
        }
        if (!decryptedText && e2eePro) {
          const chat = chats.find((c) => c.id === row.conversation_id);
          const peerUserId = row.sender_id === profile.id ? chat?.participantUserId : row.sender_id;
          if (peerUserId) {
            decryptedText = e2eePro.decryptCiphertextSync(row.body_ciphertext, row.body_nonce, peerUserId);
            if (!decryptedText) {
              const cipher = row.body_ciphertext;
              const nonce = row.body_nonce;
              const conversationId = row.conversation_id;
              const rowId = row.id;
              const rowClientId = row.client_id;
              void e2eePro.loadActiveSessions().then(() => {
                const retryText = e2eePro.decryptCiphertextSync(cipher, nonce, peerUserId);
                if (retryText) {
                  setChats((current) => current.map((c) => {
                    if (c.id !== conversationId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => (m.id === rowId || (rowClientId && m.clientId === rowClientId)) ? { ...m, text: retryText } : m)
                    };
                  }));
                }
              });
            }
          }
        }
      }
      if (decryptedText) {
        displayText = decryptedText;
      } else if (row.body && !/^\[encrypted/i.test(row.body)) {
        displayText = row.body;
      } else if (row.encryption_version === 'mc-e2ee-v2-pro') {
        displayText = '[Encrypted with E2EE Pro]';
      } else {
        displayText = '[Encrypted message]';
      }
    } else if (row.kind !== 'text' && row.kind !== 'system' && row.kind !== 'call') {
      displayText = mediaMeta.name || mediaMeta.text || row.body || row.kind;
    }

    const mediaUrl = mediaMeta.signedUrl || mediaMeta.dataUrl || (row.media_path && row.media_path.startsWith('data:') ? row.media_path : undefined);

    const incoming: Message = {
      id: row.id,
      clientId: row.client_id ?? undefined,
      chatId: row.conversation_id,
      senderId: row.sender_id === profile.id ? 'me' : row.sender_id,
      text: displayText,
      kind: row.kind,
      mediaPath: row.media_path ?? undefined,
      mediaUrl,
      fileName: mediaMeta.name,
      mimeType: mediaMeta.mimeType,
      durationMs: mediaMeta.durationMs,
      textColor: mediaMeta.textColor,
      fontStyle: mediaMeta.fontStyle,
      fontFamily: mediaMeta.fontFamily,
      callInfo: mediaMeta.callInfo,
      encrypted,
      encryptionVersion: row.encryption_version ?? undefined,
      ciphertext: row.body_ciphertext ?? undefined,
      nonce: row.body_nonce ?? undefined,
      createdAt: row.created_at,
      status: row.sender_id === profile.id ? 'sent' : 'delivered',
      replyTo: row.reply_to ?? undefined,
    };

    // Trigger notification for incoming messages
    if (notify && incoming.senderId !== 'me') {
      const chat = chats.find((c) => c.id === row.conversation_id);
      if (chat && !mutedChatIdsRef.current.has(chat.id)) {
        const senderName = chat.name || 'MacroChat';
        void triggerNotification(
          getCategoryFromMessage({}),
          notificationPrefs,
          {
            title: senderName,
            messagePreview: incoming.text,
            icon: chat.avatarUrl,
          }
        );
      }
    }

    setChats((current) => current.map((chat) => {
      if (chat.id !== row.conversation_id) return chat;
      // Match an existing message by immutable clientId first, then by real id, to avoid duplicates
      const existing = chat.messages.find((message) =>
        (incoming.clientId && message.clientId === incoming.clientId) || message.id === incoming.id);
      if (existing) {
        const preservedText = encrypted && existing.text && !/^\[encrypted/i.test(existing.text)
          ? existing.text
          : incoming.text;
        return {
          ...chat,
          messages: chat.messages.map((m) => m === existing
            ? { ...m, ...incoming, text: preservedText, clientId: incoming.clientId ?? m.clientId, status: 'sent', mediaUrl: incoming.mediaUrl || m.mediaUrl }
            : m),
        };
      }
      return {
        ...chat,
        unread: incoming.senderId === 'me' ? chat.unread : chat.unread + 1,
        messages: [...chat.messages, incoming],
      };
    }));
  }, [e2eePro, e2eePassphrase, profile, chats, notificationPrefs]);

  useEffect(() => {
    readProfileFromStorage()
      .then(async (saved) => {
        if (saved) {
          setProfile(JSON.parse(saved) as Profile);
        } else {
          await restoreProfile();
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));

    readAppearanceSettingsFromStorage()
      .then((saved) => setAppearanceSettings(saved))
      .catch(() => undefined);

    // Load fake device status
    if (Platform.OS === 'web') {
      const saved = localStorage.getItem('macrochat.fakeDeviceStatus');
      if (saved) setFakeDeviceStatus(saved as any);
    } else {
      SecureStore.getItemAsync('macrochat.fakeDeviceStatus')
        .then((saved) => {
          if (saved) setFakeDeviceStatus(saved as any);
        })
        .catch(() => undefined);
    }

    // Load notification preferences
    const applySavedPrefs = (saved: string | null) => {
      if (!saved) return;
      try {
        // Merge over defaults so prefs saved by older versions gain new keys.
        setNotificationPrefs({ ...defaultNotificationPreferences, ...JSON.parse(saved) });
      } catch {
        // Use defaults if parsing fails
      }
    };

    if (Platform.OS === 'web') {
      applySavedPrefs(localStorage.getItem('macrochat.notificationPrefs'));
    } else {
      SecureStore.getItemAsync('macrochat.notificationPrefs')
        .then(applySavedPrefs)
        .catch(() => undefined);
    }
  }, [restoreProfile]);

  useEffect(() => {
    refreshSecurityState().catch(() => undefined);
  }, [refreshSecurityState, profile?.id]);

  useEffect(() => {
    refreshPrivacyState().catch((error) => console.warn('Failed to refresh privacy settings', error));
  }, [refreshPrivacyState]);

  // Request notification permission on app start
  useEffect(() => {
    if (!profile) return;
    // Ask once, then register this device so pushes arrive while the app is closed.
    void (async () => {
      await requestNotificationPermission();
      await configureNotificationChannels().catch(() => undefined);
      await registerPushToken(profile.id).catch(() => undefined);
    })();
  }, [profile]);

  const realtimeHandlers = useRef({ loadChatsFromBackend, mergeRealtimeMessage, refreshMessageReactions });
  const realtimeUserId = profile?.id;
  useEffect(() => {
    realtimeHandlers.current = { loadChatsFromBackend, mergeRealtimeMessage, refreshMessageReactions };
  }, [loadChatsFromBackend, mergeRealtimeMessage, refreshMessageReactions]);

  useEffect(() => {
    if (e2eePro || e2eePassphrase) void realtimeHandlers.current.loadChatsFromBackend();
  }, [e2eePro, e2eePassphrase]);

  useEffect(() => {
    if (!supabase) { setChats(demoChats); return; }
    if (!realtimeUserId) { setChats([]); return; }
    const reload = () => realtimeHandlers.current.loadChatsFromBackend().catch(() => undefined);
    void reload();
    void realtimeHandlers.current.refreshMessageReactions();
    const channel = supabase.channel(`macrochat-sync-${realtimeUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'macrochat_messages' }, (change) => {
        const nextRow = change.new as MessageRow;
        realtimeHandlers.current.mergeRealtimeMessage(nextRow, true);
        if (nextRow.kind !== 'text') void reload();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'macrochat_messages' }, (change) => {
        const nextRow = change.new as MessageRow;
        if (!nextRow) return;
        realtimeHandlers.current.mergeRealtimeMessage(nextRow);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'macrochat_messages' }, (change) => {
        const deleted = change.old as MessageRow;
        if (!deleted) return;
        setChats((current) => current.map((chat) => {
          if (chat.id !== deleted.conversation_id) return chat;
          return {
            ...chat,
            messages: chat.messages.filter((message) => message.id !== deleted.id && (!deleted.client_id || message.clientId !== deleted.client_id)),
          };
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'macrochat_message_reactions' }, () => {
        void realtimeHandlers.current.refreshMessageReactions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'macrochat_conversation_members' }, () => {
        void reload();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void reload();
      });
    const refreshTimer = setInterval(reload, 8000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });

    return () => {
      clearInterval(refreshTimer);
      appStateSubscription.remove();
      supabase?.removeChannel(channel);
    };
  }, [realtimeUserId]);

  const logChatSystemMessage = useCallback((chatId: string, text: string) => {
    if (!chatId || !text.trim()) return;
    const trimmed = text.trim();
    const messageId = `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const activityMessage: Message = {
      id: messageId,
      clientId: messageId,
      chatId,
      senderId: 'me',
      text: trimmed,
      kind: 'text',
      createdAt: new Date().toISOString(),
      status: 'read',
    };

    setChats((current) => current.map((chat) => chat.id === chatId
      ? { ...chat, messages: [...chat.messages, activityMessage] }
      : chat));

    if (!supabase || !profile) return;
    void supabase.from('macrochat_messages').insert({
      conversation_id: chatId,
      sender_id: profile.id,
      body: trimmed,
      kind: 'text',
      client_id: messageId,
      text_color: '#ffffff',
      font_style: 'normal',
      font_family: 'Default',
    }).then(({ error }) => {
      if (error) {
        console.warn('Failed to persist system event message:', error.message);
      }
    });
  }, [profile]);

  const teardownCall = useCallback((outcome?: CallOutcome) => {
    void stopCallAlert();
    const call = activeCallRef.current;
    if (call) {
      const endedAt = Date.now();
      const durationSeconds = callStartedAt ? Math.max(0, Math.round((endedAt - callStartedAt) / 1000)) : 0;
      const resolvedOutcome: CallOutcome = outcome
        ?? (callStartedAt ? 'answered' : call.incoming && call.status === 'ringing' ? 'missed' : 'cancelled');

      const callText = call.video ? 'Video call' : 'Voice call';
      const callClientId = `message-${endedAt}-${Math.random().toString(36).substr(2, 6)}`;
      const callMsg: Message = {
        id: callClientId,
        clientId: callClientId,
        chatId: call.conversationId,
        senderId: call.incoming ? call.peerUserId : (profile?.id || 'me'),
        text: callText,
        kind: 'call',
        callInfo: {
          video: call.video,
          outcome: resolvedOutcome === 'answered' ? 'accepted' : resolvedOutcome,
          durationSeconds,
        },
        createdAt: new Date(endedAt).toISOString(),
        status: 'read',
      };

      setChats((current) => current.map((chat) => chat.id === call.conversationId
        ? { ...chat, messages: [...chat.messages, callMsg] }
        : chat));

      if (supabase && profile) {
        supabase.from('macrochat_call_history').upsert({
          call_id: call.callId,
          conversation_id: call.conversationId,
          caller_id: call.incoming ? call.peerUserId : profile.id,
          callee_id: call.incoming ? profile.id : call.peerUserId,
          video: call.video,
          outcome: resolvedOutcome,
          duration_seconds: durationSeconds,
          ended_at: new Date(endedAt).toISOString(),
        }, { onConflict: 'call_id' }).then(({ error }) => {
          if (error) console.warn('Failed to record call history', error.message);
          else void refreshCallHistoryRef.current?.();
        });
      }
    }

    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingIceRef.current = [];
    localCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    localCallStreamRef.current = null;
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setCallStartedAt(null);
    setMediaConnected(false);
  }, [callStartedAt, profile]);

  const ensurePeerConnection = useCallback((callId: string) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;
    const { RTCPeerConnection } = getWebRTC();
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      getCallSocket()?.emit('webrtc:ice', { callId, candidate: JSON.stringify(event.candidate) });
    };

    pc.ontrack = (event) => {
      setRemoteCallStream(event.streams[0] ?? new MediaStream([event.track]));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setMediaConnected(true);
        setCallStartedAt((current) => current ?? Date.now());
      } else if (pc.connectionState === 'disconnected') {
        setMediaConnected(false);
        // Trigger ICE restart to recover from temporary disconnects
        pc.restartIce();
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setMediaConnected(false);
        teardownCall();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, []);

  const attachLocalMedia = useCallback(async (pc: RTCPeerConnection, video: boolean) => {
    const { getUserMedia } = getWebRTC();
    const stream = await getUserMedia({ audio: true, video });
    localCallStreamRef.current = stream;
    setLocalCallStream(stream);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  }, []);

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const raw of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(raw)));
      } catch (error) {
        console.warn('Failed to add queued ICE candidate', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!profile || !supabase || !signalingUrl) {
      setSignalingReady(false);
      disconnectCallSignaling();
      teardownCall();
      return;
    }

    let cancelled = false;

    const configure = async () => {
      const token = await getSupabaseAccessToken();
      if (!token || cancelled) {
        setSignalingReady(false);
        return;
      }

      const socket = connectCallSignaling(signalingUrl, token, {
        onIncoming: (payload) => {
          if (!payload?.callId || !payload?.fromUserId || !payload?.conversationId) return;
          if (!privacySettings.allowIncomingCalls || blockedContacts.some((contact) => contact.id === payload.fromUserId)) {
            getCallSocket()?.emit('call:reject', { callId: payload.callId, toUserId: payload.fromUserId, reason: 'privacy' });
            return;
          }
          setActiveCall({
            callId: payload.callId,
            conversationId: payload.conversationId,
            peerUserId: payload.fromUserId,
            incoming: true,
            video: Boolean(payload.video),
            status: 'ringing',
          });
          // Trigger call notification
          const chat = chats.find((c) => c.id === payload.conversationId);
          const callerName = chat?.name || 'Someone';
          void triggerNotification(
            'calls',
            notificationPrefsRef.current,
            {
              title: `${callerName} is calling...`,
              body: payload.video ? 'Video call' : 'Audio call',
              icon: chat?.avatarUrl,
            }
          );
        },
        onAccepted: (payload) => {
          if (!payload?.callId) return;
          setActiveCall((current) => {
            if (!current || current.callId !== payload.callId) return current;
            return { ...current, status: 'connected' };
          });
          (async () => {
            try {
              const pc = ensurePeerConnection(payload.callId);
              await attachLocalMedia(pc, Boolean(payload.video));
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              // Encrypt SDP if E2EE passphrase is set
              if (e2eePassphrase && offer.sdp) {
                const { ciphertext, nonce } = encryptCallSignaling(offer.sdp, e2eePassphrase);
                getCallSocket()?.emit('webrtc:offer', { callId: payload.callId, sdp_ciphertext: ciphertext, sdp_nonce: nonce });
              } else {
                getCallSocket()?.emit('webrtc:offer', { callId: payload.callId, sdp: offer.sdp });
              }
            } catch (error) {
              console.warn('Failed to start call media', error);
            }
          })();
        },
        onRejected: (payload) => {
          if (!payload?.callId) return;
          teardownCall('rejected');
          setActiveCall((current) => {
            if (!current || current.callId !== payload.callId) return current;
            return null;
          });
        },
        onHangup: (payload) => {
          if (!payload?.callId) return;
          const current = activeCallRef.current;
          teardownCall(current?.incoming && current.status === 'ringing' ? 'missed' : undefined);
          setActiveCall((value) => {
            if (!value || value.callId !== payload.callId) return value;
            return null;
          });
        },
        onOffer: (payload) => {
          if (!payload?.callId) return;
          // Support both encrypted (sdp_ciphertext + sdp_nonce) and plaintext (sdp) formats
          let sdp: string | null = null;
          if (payload.sdp_ciphertext && payload.sdp_nonce && e2eePassphrase) {
            // Decrypt if encrypted
            sdp = decryptCallSignaling(payload.sdp_ciphertext, payload.sdp_nonce, e2eePassphrase);
          } else if (typeof payload.sdp === 'string') {
            // Use plaintext if no encryption
            sdp = payload.sdp;
          }
          if (!sdp) return;
          (async () => {
            try {
              const pc = ensurePeerConnection(payload.callId);
              if (pc.getSenders().length === 0) await attachLocalMedia(pc, Boolean(activeCallRef.current?.video));
              await pc.setRemoteDescription({ type: 'offer', sdp });
              await flushPendingIce(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              // Encrypt answer if E2EE passphrase is set
              if (e2eePassphrase && answer.sdp) {
                const { ciphertext, nonce } = encryptCallSignaling(answer.sdp, e2eePassphrase);
                getCallSocket()?.emit('webrtc:answer', { callId: payload.callId, sdp_ciphertext: ciphertext, sdp_nonce: nonce });
              } else {
                getCallSocket()?.emit('webrtc:answer', { callId: payload.callId, sdp: answer.sdp });
              }
            } catch (error) {
              console.warn('Failed to answer call media', error);
            }
          })();
        },
        onAnswer: (payload) => {
          if (!payload?.callId) return;
          // Support both encrypted (sdp_ciphertext + sdp_nonce) and plaintext (sdp) formats
          let sdp: string | null = null;
          if (payload.sdp_ciphertext && payload.sdp_nonce && e2eePassphrase) {
            // Decrypt if encrypted
            sdp = decryptCallSignaling(payload.sdp_ciphertext, payload.sdp_nonce, e2eePassphrase);
          } else if (typeof payload.sdp === 'string') {
            // Use plaintext if no encryption
            sdp = payload.sdp;
          }
          if (!sdp) return;
          const pc = peerConnectionRef.current;
          if (!pc) return;
          pc.setRemoteDescription({ type: 'answer', sdp })
            .then(() => flushPendingIce(pc))
            .catch((error) => console.warn('Failed to apply call answer', error));
        },
        onIce: (payload) => {
          if (typeof payload?.candidate !== 'string') return;
          const pc = peerConnectionRef.current;
          if (!pc || !pc.remoteDescription) {
            pendingIceRef.current.push(payload.candidate);
            return;
          }
          pc.addIceCandidate(new RTCIceCandidate(JSON.parse(payload.candidate))).catch((error) => {
            console.warn('Failed to add ICE candidate', error);
          });
        },
      });

      socket.on('connect', () => setSignalingReady(true));
      socket.on('disconnect', () => setSignalingReady(false));
      socket.on('connect_error', () => setSignalingReady(false));
      if (socket.connected) setSignalingReady(true);
    };

    configure().catch(() => setSignalingReady(false));

    return () => {
      cancelled = true;
      updateCallHandlers();
      disconnectCallSignaling();
      setSignalingReady(false);
    };
  }, [attachLocalMedia, blockedContacts, e2eePassphrase, ensurePeerConnection, flushPendingIce, privacySettings.allowIncomingCalls, profile, signalingUrl, teardownCall]);


  const updatePrivacySetting = useCallback(async <Key extends keyof PrivacySettings>(key: Key, settingValue: PrivacySettings[Key]) => {
    const next = { ...privacySettings, [key]: settingValue };
    setPrivacySettings(next);
    await writePrivacySettings(next);
    if (!supabase || !profile) return;
    const { error } = await supabase.from('macrochat_user_privacy').upsert({
      user_id: profile.id,
      read_receipts: next.readReceipts,
      share_typing_activity: next.shareTypingActivity,
      allow_incoming_calls: next.allowIncomingCalls,
      show_device_status: next.showDeviceStatus,
      default_message_ttl_seconds: next.defaultMessageTtlSeconds,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw toReadableDbError('Saving privacy settings failed', error);
    if (key === 'defaultMessageTtlSeconds') {
      const timerResult = await supabase.rpc('macrochat_set_disappearing_timer', { ttl_seconds: settingValue });
      if (timerResult.error) throw toReadableDbError('Saving disappearing-message timer failed', timerResult.error);
      await loadChatsFromBackend();
    }
  }, [loadChatsFromBackend, privacySettings, profile]);

  const updateAppearanceSettings = useCallback(async (nextOrUpdater: Partial<AppearanceSettings> | ((current: AppearanceSettings) => AppearanceSettings)) => {
    setAppearanceSettings((current) => {
      const resolved = typeof nextOrUpdater === 'function' ? nextOrUpdater(current) : { ...current, ...nextOrUpdater };
      void writeAppearanceSettingsToStorage(resolved);
      return resolved;
    });
  }, []);

  const updateFakeDeviceStatus = useCallback(async (status: 'mobile' | 'desktop' | 'web' | null) => {
    setFakeDeviceStatus(status);
    if (Platform.OS === 'web') {
      localStorage.setItem('macrochat.fakeDeviceStatus', status || '');
    } else {
      if (status) {
        await SecureStore.setItemAsync('macrochat.fakeDeviceStatus', status);
      } else {
        await SecureStore.deleteItemAsync('macrochat.fakeDeviceStatus');
      }
    }
  }, []);

  const updateNotificationPrefs = useCallback(async (nextPrefs: Partial<NotificationPreferences>) => {
      const updated = { ...notificationPrefsRef.current, ...nextPrefs };
      notificationPrefsRef.current = updated;
      setNotificationPrefs(updated);
      if (Platform.OS === 'web') {
        localStorage.setItem('macrochat.notificationPrefs', JSON.stringify(updated));
      } else {
        void SecureStore.setItemAsync('macrochat.notificationPrefs', JSON.stringify(updated));
      }
      // Save to Supabase if available; fail gracefully so local preference remains usable
      if (supabase && profile) {
        try {
          const dataToSave = {
            user_id: profile.id,
            messages: updated.messages,
            calls: updated.calls,
            status: updated.status,
            updates: updated.updates,
            sound: updated.sound,
            vibration: updated.vibration,
            preview: updated.preview,
            badge: updated.badge,
            background_sync: updated.backgroundSync,
            message_ringtone: updated.messageRingtone,
            call_ringtone: updated.callRingtone,
          };

          let { error } = await supabase.from('notification_preferences').upsert(dataToSave);
          if (error && /badge|background_sync|column .* does not exist/i.test(error.message || '')) {
            const retryData = { ...dataToSave };
            delete (retryData as Record<string, unknown>).badge;
            delete (retryData as Record<string, unknown>).background_sync;
            const retry = await supabase.from('notification_preferences').upsert(retryData);
            error = retry.error;
          }
          if (error) {
            console.warn('[prefs] Sync warning:', error.message || error);
          }
        } catch (error) {
          console.warn('[prefs] Sync warning:', error instanceof Error ? error.message : error);
        }
      }
  }, [profile]);

  const blockContact = useCallback(async (userId: string) => {
    setChats((current) => current.filter((chat) => chat.participantUserId !== userId));
    setBlockedContacts((prev) => {
      if (prev.some((c) => c.id === userId)) return prev;
      return [...prev, { id: userId, displayName: 'Blocked contact', macroId: 'BLOCKED', avatarColor: '#888' }];
    });

    if (supabase && profile) {
      const { error } = await supabase.from('macrochat_blocked_users').insert({ blocker_id: profile.id, blocked_id: userId });
      if (error && error.code !== '23505') console.warn('Blocking contact DB warning', error.message);
      await refreshPrivacyState();
    }
  }, [profile, refreshPrivacyState]);

  const unblockContact = useCallback(async (userId: string) => {
    if (!supabase || !profile) throw new Error('Unblocking requires an online account.');
    const { error } = await supabase.from('macrochat_blocked_users').delete().eq('blocker_id', profile.id).eq('blocked_id', userId);
    if (error) throw toReadableDbError('Unblocking contact failed', error);
    await refreshPrivacyState();
    await loadChatsFromBackend();
  }, [loadChatsFromBackend, profile, refreshPrivacyState]);

  const updateProfilePicture = useCallback(async (avatarUrl: string | null) => {
    if (!profile) return;
    const nextProfile: Profile = { ...profile, avatarUrl: avatarUrl ?? undefined };
    setProfile(nextProfile);
    await writeProfileToStorage(nextProfile);

    if (supabase) {
      try {
        const { error } = await supabase.from('macrochat_profiles').upsert({
          id: profile.id,
          macro_id: profile.macroId,
          display_name: profile.displayName,
          avatar_color: profile.avatarColor,
          avatar_url: avatarUrl ?? null,
        }, { onConflict: 'id' });
        if (error) {
          const message = (error.message || '').toLowerCase();
          const missingColumn = message.includes("could not find the 'avatar_url' column") || message.includes('avatar_url');
          if (!missingColumn) throw toReadableDbError('Saving profile photo failed', error);
        }
        // Refresh chats so other users see the updated avatar
        await loadChatsFromBackend();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown profile photo error';
        const missingColumn = message.toLowerCase().includes("could not find the 'avatar_url' column") || message.toLowerCase().includes('avatar_url');
        if (!missingColumn) throw error;
      }
    }
  }, [profile, loadChatsFromBackend]);

  const updateProfileStatus = useCallback(async (status: ProfileStatus) => {
    if (!profile) return;
    const nextProfile: Profile = { ...profile, status };
    setProfile(nextProfile);
    await writeProfileToStorage(nextProfile);
  }, [profile]);

  const updateProfileDisplayName = useCallback(async (displayName: string) => {
    if (!profile) return;
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 32) {
      throw new Error('Display name must be between 2 and 32 characters.');
    }
    const nextProfile: Profile = { ...profile, displayName: trimmed };
    setProfile(nextProfile);
    await writeProfileToStorage(nextProfile);

    if (supabase) {
      try {
        const { error } = await supabase.from('macrochat_profiles').upsert({
          id: profile.id,
          macro_id: profile.macroId,
          display_name: trimmed,
          avatar_color: profile.avatarColor,
          avatar_url: profile.avatarUrl ?? null,
        }, { onConflict: 'id' });
        if (error) throw toReadableDbError('Saving display name failed', error);
        // Refresh chats so other users see the updated name
        await loadChatsFromBackend();
      } catch (error) {
        throw error instanceof Error ? error : new Error('Failed to save display name');
      }
    }
  }, [profile, loadChatsFromBackend, supabase]);

  const register = useCallback(async (displayName: string) => {
    const session = await ensureAnonymousSession();
    const next: Profile = {
      id: session?.user.id ?? localId('anonymous'),
      macroId: generateMacroId(),
      displayName: displayName.trim(),
      avatarColor: '#55B9FF',
      avatarUrl: DEFAULT_PROFILE_AVATARS[Math.floor(Math.random() * DEFAULT_PROFILE_AVATARS.length)],
      status: 'online',
    };

    if (supabase && session) {
      const { error } = await supabase.from('macrochat_profiles').upsert({
        id: next.id,
        macro_id: next.macroId,
        display_name: next.displayName,
        avatar_color: next.avatarColor,
        avatar_url: next.avatarUrl ?? null,
      });
      if (error) throw error;
    }

    await writeProfileToStorage(next);
    setProfile(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await clearProfileFromStorage();
    await clearE2EEPassphrase();
    disconnectCallSignaling();
    setProfile(null);
    setE2eePassphrase(null);
    setActiveCall(null);
    setSignalingReady(false);
    setMfaAal2(false);
    setE2eePro(null);
    e2eeProUserIdRef.current = null;
    setChats(isSupabaseConfigured ? [] : demoChats);

    try {
      await supabase?.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('Remote session cleanup failed after local sign-out', error);
    }
  }, []);

  const enableE2EE = useCallback(async (passphrase: string) => {
    await writeE2EEPassphrase(passphrase);
    setE2eePassphrase(passphrase.trim());
  }, []);

  const disableE2EE = useCallback(async () => {
    await clearE2EEPassphrase();
    setE2eePassphrase(null);
  }, []);

  const unlockE2EE = useCallback(async (passphrase: string) => {
    const trial = passphrase.trim();
    if (trial.length < 8) return false;
    if (!(await verifyE2EEPassphrase(trial))) return false;
    await writeE2EEPassphrase(trial);
    setE2eePassphrase(trial);
    return true;
  }, []);

  const pinChat = useCallback((chatId: string) => {
    setPinnedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat));
  }, []);

  const muteChat = useCallback((chatId: string) => {
    setMutedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, muted: !chat.muted } : chat));
  }, []);

  const setChatDisappearingTimer = useCallback((chatId: string, seconds: number | null) => {
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, disappearingSeconds: seconds } : chat));
    if (supabase && profile) {
      supabase.from('macrochat_conversations').update({ message_ttl_seconds: seconds }).eq('id', chatId).then(({ error }) => {
        if (error) console.warn('Chat timer update warning', error.message);
      });
    }
  }, [profile]);

  const markChatUnread = useCallback((chatId: string) => {
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, unread: chat.unread > 0 ? 0 : 1 } : chat));
  }, []);

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, messages: chat.messages.filter((message) => message.id !== messageId) } : chat));
    if (supabase && profile) {
      supabase.from('macrochat_messages').delete().eq('id', messageId).then(({ error }) => {
        if (error) console.warn('Delete message DB warning:', error.message);
      });
    }
  }, [profile]);

  const editMessage = useCallback((chatId: string, messageId: string, newText: string) => {
    if (!newText.trim()) return;
    setChats((current) => current.map((chat) => {
      if (chat.id !== chatId) return chat;
      return {
        ...chat,
        messages: chat.messages.map((message) => {
          const matches = message.id === messageId || message.clientId === messageId;
          return matches ? { ...message, text: newText.trim(), editedAt: new Date().toISOString() } : message;
        }),
      };
    }));
    if (supabase && profile) {
      supabase.from('macrochat_messages').update({ text: newText.trim(), edited_at: new Date().toISOString() }).eq('id', messageId).then(({ error }) => {
        if (error) console.warn('Edit message DB warning:', error.message);
      });
    }
  }, [profile]);

  const toggleMessagePin = useCallback((chatId: string, messageId: string) => {
    // Update local state immediately for UI responsiveness
    setChats((current) => current.map((chat) => {
      if (chat.id !== chatId) return chat;
      return {
        ...chat,
        messages: chat.messages.map((message) => {
          const matches = message.id === messageId || message.clientId === messageId;
          return matches ? { ...message, pinned: !message.pinned } : message;
        }),
      };
    }));
    
    // Persist to backend
    if (supabase) {
      (async () => {
        try {
          await supabase.rpc('macrochat_toggle_message_pin', { message_id: messageId });
        } catch (error: any) {
          console.warn('Pin message DB warning:', error.message);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMessageStar = useCallback((chatId: string, messageId: string) => {
    // Update local state immediately for UI responsiveness
    setChats((current) => current.map((chat) => {
      if (chat.id !== chatId) return chat;
      return {
        ...chat,
        messages: chat.messages.map((message) => {
          const matches = message.id === messageId || message.clientId === messageId;
          return matches ? { ...message, starred: !message.starred } : message;
        }),
      };
    }));
    
    // Persist to backend
    if (supabase) {
      (async () => {
        try {
          await supabase.rpc('macrochat_toggle_message_star', { message_id: messageId });
        } catch (error: any) {
          console.warn('Star message DB warning:', error.message);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearChat = useCallback((chatId: string) => {
    const nextCleared = new Set(clearedChatIdsRef.current);
    nextCleared.add(chatId);
    clearedChatIdsRef.current = nextCleared;
    setClearedChatIds(nextCleared);

    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, messages: [] } : chat));
    if (supabase && profile) {
      supabase.from('macrochat_messages').delete().eq('conversation_id', chatId).then(({ error }) => {
        if (error) console.warn('Clear chat DB warning:', error.message);
      });
    }
  }, [profile]);

  const deleteChat = useCallback((chatId: string) => {
    const nextDeleted = new Set(deletedChatIdsRef.current);
    nextDeleted.add(chatId);
    deletedChatIdsRef.current = nextDeleted;
    setDeletedChatIds(nextDeleted);

    setChats((current) => current.filter((chat) => chat.id !== chatId));
    if (supabase && profile) {
      supabase.from('macrochat_conversation_members').delete().eq('conversation_id', chatId).eq('user_id', profile.id).then(({ error }) => {
        if (error) console.warn('Delete chat DB warning:', error.message);
      });
    }
  }, [profile]);

  const sendMessage = useCallback((chatId: string, text: string, replyTo?: string, options?: { textColor?: string; fontStyle?: 'normal' | 'italic'; fontFamily?: string }) => {
    const payload = text.trim();
    if (!payload) return;

    const chatSpecificTtl = chats.find((chat) => chat.id === chatId)?.disappearingSeconds;
    const disappearingSeconds = chatSpecificTtl ?? privacySettings.defaultMessageTtlSeconds;
    
    let encryptedPayload: any = null;
    let isE2EEPro = false;

    if (e2eePassphrase) {
      encryptedPayload = encryptTextWithPassphrase(payload, e2eePassphrase);
    } else if (e2eePro) {
      isE2EEPro = true;
    }

    const optimisticHasEncryptedBody = Boolean(encryptedPayload?.ciphertext && encryptedPayload?.nonce);

    // Immutable client-side ID that never changes, even after the server assigns a UUID
    const clientId = `message-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const message: Message = {
      id: clientId,
      clientId,
      chatId,
      senderId: 'me',
      text: payload,
      kind: 'text',
      textColor: options?.textColor,
      fontStyle: options?.fontStyle,
      fontFamily: options?.fontFamily,
      encrypted: optimisticHasEncryptedBody,
      encryptionVersion: optimisticHasEncryptedBody ? encryptedPayload?.version : undefined,
      ciphertext: optimisticHasEncryptedBody ? encryptedPayload?.ciphertext : undefined,
      nonce: optimisticHasEncryptedBody ? encryptedPayload?.nonce : undefined,
      createdAt: new Date().toISOString(),
      status: 'sending',
      replyTo,
      expiresAt: disappearingSeconds ? new Date(Date.now() + disappearingSeconds * 1000).toISOString() : undefined,
    };

    setChats((current) => current.map((chat) => chat.id === chatId
      ? { ...chat, unread: 0, messages: [...chat.messages, message] }
      : chat));

    const updateLocalMessageStatus = (status: Message['status']) => {
      setChats((current) => current.map((chat) => chat.id === chatId
        ? {
            ...chat,
            messages: chat.messages.map((item) => item.clientId === clientId ? { ...item, status } : item),
          }
        : chat));
    };

    if (supabase && profile) {
      const client = supabase;

      client.auth.getSession().then(async ({ data: sessionData }) => {
        const actorUserId = sessionData.session?.user.id ?? await getAuthenticatedUserId(client);
        const chat = chats.find((c) => c.id === chatId);
        const recipientUserId = chat?.participantUserId;
        
        let finalCiphertext = encryptedPayload?.ciphertext;
        let finalNonce = encryptedPayload?.nonce;
        let finalEncryptionVersion = encryptedPayload?.version;

        if (isE2EEPro && recipientUserId && e2eePro) {
          const encrypted = await e2eePro.encryptMessageForPeerAuto(payload, recipientUserId);
          if (!encrypted) throw new Error('The recipient has no active encryption key. Ask them to open the updated app, then send again.');
          finalCiphertext = encrypted.ciphertext;
          finalNonce = encrypted.nonce;
          finalEncryptionVersion = encrypted.version;
        }

        const hasEncryptedPayload = Boolean(finalCiphertext && finalNonce && finalEncryptionVersion);
        if (!hasEncryptedPayload) {
          throw new Error('Encryption is not ready. Open Security to check your keys, then send again.');
        }

        const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(replyTo || '');

        const result = await client.from('macrochat_messages').insert({
          conversation_id: chatId,
          sender_id: actorUserId,
          body: hasEncryptedPayload ? '[encrypted]' : payload,
          kind: 'text',
          body_ciphertext: hasEncryptedPayload ? finalCiphertext : null,
          body_nonce: hasEncryptedPayload ? finalNonce : null,
          encryption_version: hasEncryptedPayload ? finalEncryptionVersion : null,
          client_id: clientId,
          reply_to: isValidUuid ? replyTo : null,
          text_color: options?.textColor || '#ffffff',
          font_style: options?.fontStyle || 'normal',
          font_family: options?.fontFamily || 'Default',
          expires_at: disappearingSeconds ? new Date(Date.now() + disappearingSeconds * 1000).toISOString() : null,
        }).select('id, client_id, text_color, font_style, font_family');

        const { data, error } = result;
        if (error) throw toReadableDbError('Sending message failed', error);

        // Replace the optimistic message's id with the real UUID, matched by immutable clientId
        if (data?.[0]) {
          const realId = data[0].id as string;
          
          // Update user's last_seen timestamp
          void (async () => {
            try {
              if (!supabase) return;
              await supabase
                .from('macrochat_profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', actorUserId);
            } catch (error) {
              console.warn('Failed to update last_seen:', error);
            }
          })();

          setChats((current) => current.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((item) => item.clientId === clientId
                ? { 
                    ...item, 
                    id: realId, 
                    status: 'sent' as const,
                    encrypted: true,
                    ciphertext: finalCiphertext,
                    nonce: finalNonce,
                    encryptionVersion: finalEncryptionVersion,
                    textColor: data[0].text_color,
                    fontStyle: data[0].font_style,
                    fontFamily: data[0].font_family,
                  }
                : item),
            };
          }));
        } else {
          updateLocalMessageStatus('sent');
        }
      }).catch((error) => {
        updateLocalMessageStatus('failed');
        Alert.alert('Message not sent', error instanceof Error ? error.message : 'End-to-end encryption failed.');
      });
      return;
    }

    setTimeout(() => updateLocalMessageStatus('sent'), 350);
  }, [chats, e2eePassphrase, profile, e2eePro, privacySettings.defaultMessageTtlSeconds]);

  const sendMediaMessage = useCallback(async (chatId: string, input: {
    kind: Exclude<MessageKind, 'text' | 'system'>;
    uri: string;
    fileName?: string;
    mimeType?: string;
    durationMs?: number;
    replyTo?: string;
  }) => {
    const chatSpecificTtl = chats.find((chat) => chat.id === chatId)?.disappearingSeconds;
    const disappearingSeconds = chatSpecificTtl ?? privacySettings.defaultMessageTtlSeconds;
    const portableUri = await ensurePortableDataUrl(input.uri, input.mimeType);

    // Immutable client-side ID that never changes, even after the server assigns a UUID
    const clientId = `message-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const localMessage: Message = {
      id: clientId,
      clientId,
      chatId,
      senderId: 'me',
      text: input.fileName || input.kind,
      kind: input.kind,
      mediaUrl: portableUri,
      fileName: input.fileName,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      createdAt: new Date().toISOString(),
      status: 'sending',
      replyTo: input.replyTo,
      expiresAt: disappearingSeconds ? new Date(Date.now() + disappearingSeconds * 1000).toISOString() : undefined,
    };

    setChats((current) => current.map((chat) => chat.id === chatId
      ? { ...chat, unread: 0, messages: [...chat.messages, localMessage] }
      : chat));

    const updateLocalMessage = (patch: Partial<Message>) => {
      setChats((current) => current.map((chat) => chat.id === chatId
        ? {
            ...chat,
            messages: chat.messages.map((item) => item.clientId === clientId ? { ...item, ...patch } : item),
          }
        : chat));
    };

    if (!supabase || !profile) {
      setTimeout(() => updateLocalMessage({ status: 'sent' }), 350);
      return;
    }

    try {
      const actorUserId = await getAuthenticatedUserId(supabase);
      const contentType = input.mimeType || 'application/octet-stream';
      let path: string | undefined = undefined;
      let signedUrl: string | undefined = undefined;

      try {
        const uploadBody = await readUriAsUploadBody(portableUri);
        const ext = inferExtension(input.fileName, input.mimeType || undefined);
        const candidatePath = `${chatId}/${actorUserId}/${Date.now()}-${clientId}.${ext}`;

        const uploadRes = await supabase.storage.from('macrochat-media').upload(candidatePath, uploadBody, {
          contentType,
          upsert: false,
        });
        if (uploadRes.error) {
          // Upload failed, fall back to data URI
        } else {
          const signedRes = await supabase.storage.from('macrochat-media').createSignedUrl(candidatePath, 60 * 60 * 24);
          if (signedRes.data?.signedUrl) {
            path = candidatePath;
            signedUrl = signedRes.data.signedUrl;
          }
        }
      } catch (storageErr) {
        // Silently fall back to data URI
      }

      const mediaBody = JSON.stringify({
        name: input.fileName || input.kind,
        durationMs: input.durationMs,
        mimeType: contentType,
        ...(signedUrl ? { signedUrl } : {}),
      });

      const finalMediaPath = path || portableUri;
      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.replyTo || '');

      const insertRes = await supabase.from('macrochat_messages').insert({
        conversation_id: chatId,
        sender_id: actorUserId,
        body: mediaBody,
        kind: input.kind,
        media_path: finalMediaPath,
        client_id: localMessage.id,
        reply_to: isValidUuid ? input.replyTo : null,
        expires_at: disappearingSeconds ? new Date(Date.now() + disappearingSeconds * 1000).toISOString() : null,
      }).select('id, client_id');

      if (insertRes.error) throw insertRes.error;

      // Replace the optimistic message's id with the real UUID, matched by immutable clientId
      if (insertRes.data?.[0]) {
        const realId = (insertRes.data as any)[0].id;
        setChats((current) => current.map((chat) => chat.id === chatId
          ? {
              ...chat,
              messages: chat.messages.map((item) => item.clientId === clientId ? { ...item, id: realId } : item),
            }
          : chat));
      }

      updateLocalMessage({
        status: 'sent',
        mediaPath: finalMediaPath,
        mediaUrl: signedUrl || portableUri,
        mimeType: contentType,
      });
    } catch (error) {
      updateLocalMessage({ status: 'sent' });
      console.warn('Media message sync warning', error instanceof Error ? error.message : error);
    }
  }, [chats, profile, privacySettings.defaultMessageTtlSeconds]);

  const addChat = useCallback(async (macroId: string) => {
    const normalized = macroId.trim().toUpperCase();

    const existing = chats.find((chat) => chat.macroId === normalized);
    if (existing) return existing.id;

    const seedLocalChat = (conversationId: string, participantUserId: string) => {
      setChats((current) => {
        if (current.some((chat) => chat.id === conversationId)) return current;
        return [{
          id: conversationId,
          name: normalized.replace('MC-', '').replace('-', ' '),
          macroId: normalized,
          participantUserId,
          avatarColor: '#71F79F',
          online: false,
          lastSeen: 'new contact',
          unread: 0,
          messages: [],
        }, ...current];
      });
    };

    if (!supabase || !profile) {
      const id = localId('chat');
      setChats((current) => [{
        id,
        name: normalized.replace('MC-', '').replace('-', ' '),
        macroId: normalized,
        avatarColor: '#71F79F',
        online: false,
        lastSeen: 'new contact',
        unread: 0,
        messages: [],
      }, ...current]);
      return id;
    }

    const actorUserId = await getAuthenticatedUserId(supabase);

    // Verify the actor's profile exists in the database before creating a conversation.
    // This prevents FK constraint errors if the profile insert hasn't replicated yet.
    const { data: actorProfile, error: actorError } = await supabase
      .from('macrochat_profiles')
      .select('id')
      .eq('id', actorUserId)
      .maybeSingle();

    if (actorError) throw toReadableDbError('Checking your profile failed', actorError);
    if (!actorProfile) throw new Error('Your profile is not ready yet. Please refresh and try again.');

    const { data: lookup, error: lookupError, status: lookupStatus } = await supabase.rpc('macrochat_find_profile_by_macro_id', {
      target_macro_id: normalized,
    });

    let target: { id: string } | null = Array.isArray(lookup) ? (lookup[0] as { id: string } | null) : null;

    if (lookupError) {
      const message = (lookupError.message || '').toLowerCase();
      const missingRpc = lookupStatus === 404 || message.includes('could not find') || message.includes('function');

      if (!missingRpc) {
        throw toReadableDbError('Profile lookup failed', lookupError);
      }

      // Dev fallback: if RPC migration has not been applied yet, read directly.
      const directLookupRes = await supabase
        .from('macrochat_profiles')
        .select('id')
        .eq('macro_id', normalized)
        .limit(1)
        .maybeSingle();

      if (directLookupRes.error) {
        throw toReadableDbError('Profile lookup fallback failed', directLookupRes.error);
      }

      target = directLookupRes.data ? { id: directLookupRes.data.id } : null;
    }

    if (!target?.id) throw new Error('Macro ID was not found.');
    if (target.id === actorUserId) throw new Error('You cannot start a private chat with yourself.');
    if (blockedContacts.some((contact) => contact.id === target.id)) throw new Error('Unblock this contact before starting a conversation.');

    const myConversationsRes = await supabase
      .from('macrochat_conversation_members')
      .select('conversation_id')
      .eq('user_id', actorUserId);
    if (myConversationsRes.error) throw toReadableDbError('Reading your conversation memberships failed', myConversationsRes.error);

    const myConversationIds = (myConversationsRes.data ?? []).map((row) => row.conversation_id);

    if (myConversationIds.length > 0) {
      const targetMembershipRes = await supabase
        .from('macrochat_conversation_members')
        .select('conversation_id')
        .eq('user_id', target.id)
        .in('conversation_id', myConversationIds);
      if (targetMembershipRes.error) throw toReadableDbError('Reading target memberships failed', targetMembershipRes.error);

      const candidateIds = (targetMembershipRes.data ?? []).map((row) => row.conversation_id);
      if (candidateIds.length > 0) {
        const directConversationRes = await supabase
          .from('macrochat_conversations')
          .select('id,is_group')
          .in('id', candidateIds)
          .eq('is_group', false)
          .limit(1)
          .maybeSingle();

        if (directConversationRes.data?.id) {
          seedLocalChat(directConversationRes.data.id, target.id);
          loadChatsFromBackend().catch((error) => {
            console.warn('Failed to refresh chats after finding existing conversation', error);
          });
          return directConversationRes.data.id;
        }
      }
    }

    const createConversationRes = await supabase
      .from('macrochat_conversations')
      .insert({ created_by: actorUserId, is_group: false })
      .select('id')
      .single();

    if (createConversationRes.error) {
      throw toReadableDbError('Creating private conversation failed', createConversationRes.error);
    }

    const conversationId = createConversationRes.data.id;
    seedLocalChat(conversationId, target.id);

    const memberInsertRes = await supabase.from('macrochat_conversation_members').insert([
      { conversation_id: conversationId, user_id: actorUserId, role: 'admin' },
      { conversation_id: conversationId, user_id: target.id, role: 'member' },
    ]);
    if (memberInsertRes.error) throw toReadableDbError('Adding conversation members failed', memberInsertRes.error);

    if (privacySettings.defaultMessageTtlSeconds) {
      const timerUpdate = await supabase
        .from('macrochat_conversations')
        .update({ message_ttl_seconds: privacySettings.defaultMessageTtlSeconds })
        .eq('id', conversationId);
      if (timerUpdate.error) throw toReadableDbError('Applying disappearing-message timer failed', timerUpdate.error);
    }

    loadChatsFromBackend().catch((error) => {
      console.warn('Failed to refresh chats after creating conversation', error);
    });
    return conversationId;
  }, [blockedContacts, chats, loadChatsFromBackend, privacySettings.defaultMessageTtlSeconds, profile]);

  const markRead = useCallback((chatId: string) => {
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, unread: 0 } : chat));
    if (supabase && profile) {
      const client = supabase;
      void (async () => {
        try {
          const actorUserId = await getAuthenticatedUserId(client);
          const { error } = await client
            .from('macrochat_conversation_members')
            .update({
              last_read_at: new Date().toISOString(),
              ...(privacySettings.readReceipts ? { receipt_read_at: new Date().toISOString() } : {}),
            })
            .eq('conversation_id', chatId)
            .eq('user_id', actorUserId);
          if (error) console.warn('Failed to mark read', error.message);
        } catch (error) {
          console.warn('markRead session failed', error);
        }
      })();
    }
  }, [privacySettings.readReceipts, profile]);

  const startCall = useCallback(async (chatId: string, video: boolean) => {
    if (activeCallRef.current || activeCall) throw new Error('A call is already in progress.');
    if (!signalingEnabled) throw new Error('Signaling URL is not configured. Add EXPO_PUBLIC_SIGNALING_URL.');
    if (!profile) throw new Error('You must be signed in first.');

    const chat = chats.find((item) => item.id === chatId);
    if (!chat || !chat.participantUserId) throw new Error('Direct call target is unavailable for this chat.');
    if (blockedContacts.some((contact) => contact.id === chat.participantUserId)) throw new Error('Unblock this contact before calling.');

    const socket = getCallSocket();
    if (!socket?.connected) throw new Error('Call signaling is not connected yet.');

    const callId = localId('call');
    socket.emit('call:invite', {
      callId,
      toUserId: chat.participantUserId,
      conversationId: chatId,
      video,
    });

    setActiveCall({
      callId,
      conversationId: chatId,
      peerUserId: chat.participantUserId,
      incoming: false,
      video,
      status: 'dialing',
    });
  }, [blockedContacts, chats, profile, signalingEnabled]);

  const startAudioCall = useCallback((chatId: string) => startCall(chatId, false), [startCall]);
  const startVideoCall = useCallback((chatId: string) => startCall(chatId, true), [startCall]);

  const acceptIncomingCall = useCallback(() => {
    const socket = getCallSocket();
    if (!socket || !activeCall || !activeCall.incoming) return;
    void stopCallAlert();
    socket.emit('call:accept', { callId: activeCall.callId, toUserId: activeCall.peerUserId });
    setActiveCall((current) => (current ? { ...current, status: 'connected' } : current));
  }, [activeCall]);

  const rejectIncomingCall = useCallback(() => {
    const socket = getCallSocket();
    if (!socket || !activeCall || !activeCall.incoming) return;
    socket.emit('call:reject', { callId: activeCall.callId, toUserId: activeCall.peerUserId, reason: 'rejected' });
    teardownCall('rejected');
    setActiveCall(null);
  }, [activeCall, teardownCall]);

  const endActiveCall = useCallback(() => {
    const socket = getCallSocket();
    if (socket && activeCall) {
      socket.emit('call:hangup', { callId: activeCall.callId, toUserId: activeCall.peerUserId });
    }
    teardownCall();
    setActiveCall(null);
  }, [activeCall, teardownCall]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const chatsWithPresence = useMemo(() => chats.map((chat) => {
    const presence = chat.participantUserId ? presenceByUser[chat.participantUserId] : undefined;
    const status = presence?.status ?? (chat.online ? 'online' : 'offline');
    if (!presence) return { ...chat, status, peerDevice: undefined, online: status !== 'offline' };
    return { ...chat, status, online: status !== 'offline', peerDevice: presence.device, lastSeen: status };
  }), [chats, presenceByUser]);

  const value = useMemo(() => ({
    profile,
    loading,
    chats: chatsWithPresence,
    activityByChat,
    presenceByUser,
    backendMode: isSupabaseConfigured ? 'supabase' as const : 'demo' as const,
    signalingReady,
    signalingEnabled,
    activeCall,
    mfaAal2,
    e2eeEnabled: Boolean(e2eePassphrase),
    e2eePro,
    privacySettings,
    appearanceSettings,
    blockedContacts,
    fakeDeviceStatus,
    notificationPrefs,
    register,
    restoreProfile,
    updateProfilePicture,
    updateProfileStatus,
    updateProfileDisplayName,
    setChatDisappearingTimer,
    signOut,
    refreshSecurityState,
    enableE2EE,
    disableE2EE,
    unlockE2EE,
    updatePrivacySetting,
    updateAppearanceSettings,
    updateFakeDeviceStatus,
    updateNotificationPrefs,
    blockContact,
    unblockContact,
    sendMessage,
    pinChat,
    muteChat,
    markChatUnread,
    clearChat,
    deleteChat,
    sendMediaMessage,
    sendChatActivity,
    logChatSystemMessage,
    addChat,
    markRead,
    refreshChats: loadChatsFromBackend,
    startAudioCall,
    startVideoCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endActiveCall,
    localCallStream,
    remoteCallStream,
    callStartedAt,
    mediaConnected,
    callHistory,
    refreshCallHistory,
    updates,
    refreshUpdates,
    postUpdate,
    markUpdateViewed,
    deleteUpdate,
    updateReactions,
    updateComments,
    postUpdateReaction,
    removeUpdateReaction,
    postUpdateComment,
    removeUpdateComment,
    messageReactions,
    messageComments,
    postMessageReaction,
    removeMessageReaction,
    postMessageComment,
    removeMessageComment,
    deleteMessage,
    editMessage,
    toggleMessagePin,
    toggleMessageStar,
  }), [
    profile,
    loading,
    chatsWithPresence,
    activityByChat,
    presenceByUser,
    signalingReady,
    signalingEnabled,
    activeCall,
    mfaAal2,
    e2eePassphrase,
    e2eePro,
    privacySettings,
    appearanceSettings,
    blockedContacts,
    register,
    fakeDeviceStatus,
    notificationPrefs,
    updateAppearanceSettings,
    updateFakeDeviceStatus,
    updateNotificationPrefs,
    restoreProfile,
    updateProfilePicture,
    updateProfileStatus,
    updateProfileDisplayName,
    setChatDisappearingTimer,
    signOut,
    refreshSecurityState,
    enableE2EE,
    disableE2EE,
    unlockE2EE,
    updatePrivacySetting,
    blockContact,
    unblockContact,
    sendMessage,
    pinChat,
    muteChat,
    markChatUnread,
    clearChat,
    deleteChat,
    sendMediaMessage,
    sendChatActivity,
    logChatSystemMessage,
    addChat,
    markRead,
    loadChatsFromBackend,
    startAudioCall,
    startVideoCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endActiveCall,
    localCallStream,
    remoteCallStream,
    callStartedAt,
    mediaConnected,
    callHistory,
    refreshCallHistory,
    updates,
    refreshUpdates,
    postUpdate,
    updateReactions,
    updateComments,
    postUpdateReaction,
    removeUpdateReaction,
    postUpdateComment,
    removeUpdateComment,
    messageReactions,
    messageComments,
    postMessageReaction,
    removeMessageReaction,
    postMessageComment,
    removeMessageComment,
    deleteMessage,
    editMessage,
    toggleMessagePin,
    toggleMessageStar,
    markUpdateViewed,
    deleteUpdate,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
