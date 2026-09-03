import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { DEFAULT_PROFILE_AVATARS } from '@/components/Avatar';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import type { CallHistoryEntry, CallOutcome, Chat, Message, MessageKind, Profile, UpdateItem, UpdateReaction, UpdateComment, MessageReaction, MessageComment } from '@/types';
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

const PROFILE_KEY = 'macrochat.profile';
const DEVICE_ID_KEY = 'macrochat.device_id';

type AppContextValue = {
  profile: Profile | null;
  loading: boolean;
  chats: Chat[];
  activityByChat: Record<string, { state: 'typing' | 'recording'; userId: string }>;
  backendMode: 'demo' | 'supabase';
  signalingReady: boolean;
  signalingEnabled: boolean;
  activeCall: ActiveCall | null;
  mfaAal2: boolean;
  e2eeEnabled: boolean;
  e2eePro: E2EEProService | null;
  privacySettings: PrivacySettings;
  blockedContacts: BlockedContact[];
  register: (displayName: string) => Promise<Profile>;
  restoreProfile: () => Promise<Profile | null>;
  updateProfilePicture: (avatarUrl: string | null) => Promise<void>;
  setChatDisappearingTimer: (chatId: string, seconds: number | null) => void;
  signOut: () => Promise<void>;
  refreshSecurityState: () => Promise<void>;
  enableE2EE: (passphrase: string) => Promise<void>;
  disableE2EE: () => Promise<void>;
  unlockE2EE: (passphrase: string) => Promise<boolean>;
  updatePrivacySetting: <Key extends keyof PrivacySettings>(key: Key, value: PrivacySettings[Key]) => Promise<void>;
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
  sendChatActivity: (chatId: string, state: 'typing' | 'recording' | null) => void;
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
  created_at: string;
  expires_at: string | null;
};

type DbErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
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

  const parts = [message || 'Unknown database error'];
  if (error?.code) parts.push(`code=${error.code}`);
  if (error?.details) parts.push(error.details);
  if (error?.hint) parts.push(`hint=${error.hint}`);
  return new Error(`${step}: ${parts.join(' | ')}`);
}

function parseMediaBody(body: string | null | undefined): {
  name?: string;
  durationMs?: number;
  mimeType?: string;
  dataUrl?: string;
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

// Device ID management for E2EE Pro
async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_ID_KEY) : null;
    if (stored) return stored;
    const deviceId = localId('device');
    if (typeof localStorage !== 'undefined') localStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  }
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;
  const deviceId = localId('device');
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activityByChat, setActivityByChat] = useState<Record<string, { state: 'typing' | 'recording'; userId: string }>>({});
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
  const [e2eePassphrase, setE2eePassphrase] = useState<string | null>(null);
  const [privacySettings, setPrivacySettings] = useState(defaultPrivacySettings);
  const [blockedContacts, setBlockedContacts] = useState<BlockedContact[]>([]);

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
  const syncChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
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
      if (userId && !deviceIdRef.current) {
        const deviceId = await getOrCreateDeviceId();
        deviceIdRef.current = deviceId;
        const service = initializeE2EEProService(userId, deviceId);
        await service.initialize();
        setE2eePro(service);
        console.log('[E2EE Pro] Service initialized for user:', userId, 'device:', deviceId);
      }
    } catch (error) {
      console.error('[E2EE Pro] Initialization failed:', error);
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
        .select('read_receipts,share_typing_activity,allow_incoming_calls,default_message_ttl_seconds')
        .eq('user_id', profile.id)
        .maybeSingle(),
      supabase.rpc('macrochat_list_blocked_users'),
    ]);

    if (!privacyResult.error && privacyResult.data) {
      const synced: PrivacySettings = {
        readReceipts: privacyResult.data.read_receipts,
        shareTypingActivity: privacyResult.data.share_typing_activity,
        allowIncomingCalls: privacyResult.data.allow_incoming_calls,
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

    console.log('[refreshUpdates] Raw rows from DB:', rows.length, rows.slice(0, 1).map(r => ({ id: r.id, kind: r.kind, hasMediaData: !!r.media_data, mediaDataLength: r.media_data?.length })));

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

    console.log('[refreshUpdates] Final updates:', { total: rows.length, byType: rows.reduce((acc, r) => ({...acc, [r.kind]: (acc[r.kind] || 0) + 1}), {} as Record<string, number>), withMediaUrl: rows.filter(r => r.media_data && (r.media_data.startsWith('data:') || r.media_data.startsWith('blob:'))).length });
  }, [profile]);

  const postUpdate = useCallback(async (input: { kind: 'photo' | 'video' | 'text'; uri?: string; caption?: string }) => {
    console.log('[postUpdate] Starting with input:', input);
    if (!supabase || !profile) throw new Error('Posting an update requires an online account.');

    let mediaData: string | null = null;
    if (input.uri) {
      console.log('[postUpdate] Reading media from URI:', input.uri);
      const blob = await readUriAsUploadBody(input.uri);
      
      if (blob instanceof Blob) {
        console.log('[postUpdate] Converting blob to base64');
        mediaData = await blobToBase64(blob);
        console.log('[postUpdate] Base64 data length:', mediaData.length);
      } else {
        throw new Error('Unsupported platform for media upload');
      }
    }

    console.log('[postUpdate] Inserting update to database with media_data');
    const { error } = await supabase.from('macrochat_updates').insert({
      user_id: profile.id,
      kind: input.kind,
      media_data: mediaData,
      caption: input.caption,
    });
    if (error) {
      console.error('[postUpdate] Insert error:', error);
      throw toReadableDbError('Posting update failed', error);
    }
    console.log('[postUpdate] Insert successful, refreshing updates');

    await refreshUpdates();
    console.log('[postUpdate] Complete');
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
      console.error('[deleteUpdate] Error:', error.message);
      throw toReadableDbError('Failed to delete update', error);
    }
    console.log('[deleteUpdate] Success, removing from state');
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

    const optimisticReaction = {
      id: `local-${messageId}-${emoji}-${Date.now()}`,
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
    }, { onConflict: 'message_id,user_id' }).select() as { data: any[] | null; error: any };
    if (error) throw error;
    const reaction = data?.[0];
    if (reaction) {
      setMessageReactions((current) => ({
        ...current,
        [messageId]: [...(current[messageId] ?? []).filter((r) => r.emoji !== emoji), {
          id: reaction.id,
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
    await supabase.from('macrochat_message_reactions').delete().eq('id', reactionId);
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

    const { data: sessionData } = await supabase.auth.getSession();
    const actorUserId = sessionData.session?.user.id ?? profile.id;

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
        .select('id,client_id,conversation_id,sender_id,body,kind,media_path,body_ciphertext,body_nonce,encryption_version,reply_to,created_at,expires_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true }),
    ]);

    if (conversationsRes.error || conversationMembersRes.error || messagesRes.error) {
      console.warn('Failed to load conversations/messages');
      return;
    }

    const members = (conversationMembersRes.data ?? []) as unknown as ConversationMemberRow[];
    const messages = (messagesRes.data ?? []) as MessageRow[];
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
            .map((row) => {
          const mediaMeta = parseMediaBody(row.body);
          const encrypted = Boolean(row.body_ciphertext && row.body_nonce && row.encryption_version);
          let displayText = mediaMeta.text || row.body;
          if (encrypted) {
            if (row.encryption_version === 'mc-e2ee-v2-pro' && e2eePro) {
              // E2EE Pro - try to decrypt with service
              try {
                // Note: Full decryption requires X3DH session lookup from DB
                // For now, mark as encrypted and decrypt on-demand in UI
                displayText = '[Encrypted with E2EE Pro]';
              } catch (error) {
                console.warn('[E2EE Pro] Decryption failed:', error);
                displayText = '[Unable to decrypt]';
              }
            } else if (e2eePassphrase) {
              // Phase 1 passphrase-based
              const decrypted = decryptTextWithPassphrase(row.body_ciphertext!, row.body_nonce!, e2eePassphrase);
              displayText = decrypted ?? '[Unable to decrypt]';
            } else {
              displayText = '[Encrypted message]';
            }
          } else if (row.kind !== 'text' && row.kind !== 'system' && row.kind !== 'call') {
            displayText = mediaMeta.name || mediaMeta.text || row.body || row.kind;
          }

          return {
            id: row.id,
            clientId: row.client_id ?? undefined,
            chatId: row.conversation_id,
            senderId: row.sender_id === actorUserId ? 'me' : row.sender_id,
            text: displayText,
            kind: row.kind,
            mediaPath: row.media_path ?? undefined,
            mediaUrl: mediaMeta.dataUrl || (row.media_path ? (row.media_path.startsWith('data:') ? row.media_path : signedByPath.get(row.media_path)) : undefined),
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
            status: !conversation.is_group && row.sender_id === actorUserId && otherReceiptReadAt && new Date(otherReceiptReadAt).getTime() >= new Date(row.created_at).getTime() ? 'read' : row.sender_id === actorUserId ? 'sent' : 'delivered',
            replyTo: row.reply_to ?? undefined,
            expiresAt: row.expires_at ?? undefined,
          };
        });

      const unread = mappedMessages.filter((message) => {
        if (message.senderId === 'me') return false;
        if (!myLastReadAt) return true;
        return new Date(message.createdAt).getTime() > new Date(myLastReadAt).getTime();
      }).length;

      const lastSeen = other?.macrochat_profiles?.last_seen
        ? `last seen ${new Date(other.macrochat_profiles.last_seen).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : conversation.is_group ? 'group conversation' : 'private contact';

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
      const aLast = a.messages[a.messages.length - 1]?.createdAt ?? '';
      const bLast = b.messages[b.messages.length - 1]?.createdAt ?? '';
      return new Date(bLast).getTime() - new Date(aLast).getTime();
    });

    setChats((current) => {
      const pendingByConversation = new Map<string, Message[]>();
      current.forEach((chat) => {
        const pending = chat.messages.filter((message) => message.senderId === 'me' && (message.status === 'sending' || message.status === 'failed'));
        if (pending.length > 0) pendingByConversation.set(chat.id, pending);
      });

      return builtChats.map((chat) => {
        const pending = pendingByConversation.get(chat.id);
        if (!pending || pending.length === 0) return chat;

        const existingIds = new Set(chat.messages.map((message) => message.id));
        const carryForward = pending.filter((message) => !existingIds.has(message.id));
        if (carryForward.length === 0) return chat;

        const mergedMessages = [...chat.messages, ...carryForward]
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        return { ...chat, messages: mergedMessages };
      });
    });
  }, [blockedContacts, e2eePassphrase, profile]);

  const mergeRealtimeMessage = useCallback((row: MessageRow) => {
    if (!profile) return;

    const mediaMeta = parseMediaBody(row.body);
    const encrypted = Boolean(row.body_ciphertext && row.body_nonce && row.encryption_version);
    let displayText = mediaMeta.text || row.body;
    if (encrypted) {
      if (row.encryption_version === 'mc-e2ee-v2-pro' && e2eePro) {
        // E2EE Pro - try to decrypt with service
        try {
          // Note: Full decryption requires X3DH session lookup from DB
          // For now, mark as encrypted and decrypt on-demand in UI
          displayText = '[Encrypted with E2EE Pro]';
        } catch (error) {
          console.warn('[E2EE Pro] Decryption failed:', error);
          displayText = '[Unable to decrypt]';
        }
      } else if (e2eePassphrase) {
        // Phase 1 passphrase-based
        displayText = decryptTextWithPassphrase(row.body_ciphertext!, row.body_nonce!, e2eePassphrase) ?? '[Unable to decrypt]';
      } else {
        displayText = '[Encrypted message]';
      }
    } else if (row.kind !== 'text' && row.kind !== 'system' && row.kind !== 'call') {
      displayText = mediaMeta.name || mediaMeta.text || row.body || row.kind;
    }

    const mediaUrl = mediaMeta.dataUrl || (row.media_path && row.media_path.startsWith('data:') ? row.media_path : undefined);

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

    setChats((current) => current.map((chat) => {
      if (chat.id !== row.conversation_id) return chat;
      // Match an existing message by immutable clientId first, then by real id, to avoid duplicates
      const existing = chat.messages.find((message) =>
        (incoming.clientId && message.clientId === incoming.clientId) || message.id === incoming.id);
      if (existing) {
        return {
          ...chat,
          messages: chat.messages.map((m) => m === existing
            ? { ...m, ...incoming, clientId: incoming.clientId ?? m.clientId, status: 'sent' }
            : m),
        };
      }
      return {
        ...chat,
        unread: incoming.senderId === 'me' ? chat.unread : chat.unread + 1,
        messages: [...chat.messages, incoming],
      };
    }));
  }, [e2eePro, e2eePassphrase, profile]);

  useEffect(() => {
    readProfileFromStorage()
      .then(async (saved) => {
        if (saved) {
          setProfile(JSON.parse(saved) as Profile);
          return;
        }
        await restoreProfile();
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [restoreProfile]);

  useEffect(() => {
    refreshSecurityState().catch(() => undefined);
  }, [refreshSecurityState]);

  useEffect(() => {
    refreshPrivacyState().catch((error) => console.warn('Failed to refresh privacy settings', error));
  }, [refreshPrivacyState]);

  useEffect(() => {
    if (!supabase) {
      setChats(demoChats);
      setActivityByChat({});
      return;
    }

    if (!profile) {
      setChats([]);
      setActivityByChat({});
      return;
    }

    loadChatsFromBackend().catch(() => undefined);

    const channel = supabase.channel(`macrochat-sync-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'macrochat_messages' }, (change) => {
        mergeRealtimeMessage(change.new as MessageRow);
        if ((change.new as MessageRow).kind !== 'text') loadChatsFromBackend().catch(() => undefined);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'macrochat_messages' }, () => {
        loadChatsFromBackend().catch(() => undefined);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'macrochat_messages' }, () => {
        loadChatsFromBackend().catch(() => undefined);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'macrochat_conversation_members' }, () => {
        loadChatsFromBackend().catch(() => undefined);
      })
      .on('broadcast', { event: 'chat-activity' }, ({ payload }) => {
        const next = payload as { chatId?: string; userId?: string; state?: 'typing' | 'recording' | null };
        if (!next?.chatId || !next?.userId || next.userId === profile.id) return;

        if (!next.state) {
          setActivityByChat((current) => {
            if (!current[next.chatId!]) return current;
            const updated = { ...current };
            delete updated[next.chatId!];
            return updated;
          });
          return;
        }

        const activityChatId = next.chatId;
        const activityUserId = next.userId;
        const activityState = next.state;
        if (activityChatId && activityUserId && activityState) {
          setActivityByChat((current) => ({
            ...current,
            [activityChatId]: {
              state: activityState,
              userId: activityUserId,
            },
          }));
        }

        setTimeout(() => {
          setActivityByChat((current) => {
            const active = current[next.chatId!];
            if (!active || active.userId !== next.userId || active.state !== next.state) return current;
            const updated = { ...current };
            delete updated[next.chatId!];
            return updated;
          });
        }, 2500);
      })
      .subscribe();

    const refreshTimer = setInterval(() => {
      loadChatsFromBackend().catch(() => undefined);
    }, 5000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadChatsFromBackend().catch(() => undefined);
    });

    syncChannelRef.current = channel;

    return () => {
      clearInterval(refreshTimer);
      appStateSubscription.remove();
      syncChannelRef.current = null;
      supabase?.removeChannel(channel);
    };
  }, [loadChatsFromBackend, mergeRealtimeMessage, profile]);

  const sendChatActivity = useCallback((chatId: string, state: 'typing' | 'recording' | null) => {
    if (state && !privacySettings.shareTypingActivity) return;
    if (!chatId || !profile || !syncChannelRef.current) return;
    syncChannelRef.current.send({
      type: 'broadcast',
      event: 'chat-activity',
      payload: {
        chatId,
        userId: profile.id,
        state,
      },
    }).catch(() => undefined);
  }, [privacySettings.shareTypingActivity, profile]);

  const teardownCall = useCallback((outcome?: CallOutcome) => {
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
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setMediaConnected(false);
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

  const register = useCallback(async (displayName: string) => {
    const session = await ensureAnonymousSession();
    const next: Profile = {
      id: session?.user.id ?? localId('anonymous'),
      macroId: generateMacroId(),
      displayName: displayName.trim(),
      avatarColor: '#55B9FF',
      avatarUrl: DEFAULT_PROFILE_AVATARS[Math.floor(Math.random() * DEFAULT_PROFILE_AVATARS.length)],
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

  const clearChat = useCallback((chatId: string) => {
    setClearedChatIds((prev) => new Set(prev).add(chatId));
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, messages: [] } : chat));
    if (supabase && profile) {
      supabase.from('macrochat_messages').delete().eq('conversation_id', chatId).then(({ error }) => {
        if (error) console.warn('Clear chat DB warning:', error.message);
      });
    }
  }, [profile]);

  const deleteChat = useCallback((chatId: string) => {
    setDeletedChatIds((prev) => new Set(prev).add(chatId));
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

    const disappearingSeconds = chats.find((chat) => chat.id === chatId)?.disappearingSeconds;
    
    // Try E2EE Pro first, fall back to passphrase
    let encryptedPayload: any = null;
    let isE2EEPro = false;
    
    if (e2eePro) {
      isE2EEPro = true;
      // E2EE Pro encryption will happen after we get recipient ID
    } else if (e2eePassphrase) {
      encryptedPayload = encryptTextWithPassphrase(payload, e2eePassphrase);
    }

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
      encrypted: Boolean(encryptedPayload || isE2EEPro),
      encryptionVersion: encryptedPayload?.version || (isE2EEPro ? 'mc-e2ee-v2-pro' : undefined),
      ciphertext: encryptedPayload?.ciphertext,
      nonce: encryptedPayload?.nonce,
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
      const formattedBody = (options?.textColor || options?.fontStyle || options?.fontFamily)
        ? JSON.stringify({
            text: payload,
            textColor: options?.textColor,
            fontStyle: options?.fontStyle,
            fontFamily: options?.fontFamily,
          })
        : payload;

      client.auth.getSession().then(async ({ data: sessionData }) => {
        const actorUserId = sessionData.session?.user.id ?? profile.id;
        const chat = chats.find((c) => c.id === chatId);
        const recipientUserId = chat?.participantUserId;
        
        // Encrypt with E2EE Pro if available
        let finalCiphertext = encryptedPayload?.ciphertext;
        let finalNonce = encryptedPayload?.nonce;
        let finalEncryptionVersion = encryptedPayload?.version || (isE2EEPro ? 'mc-e2ee-v2-pro' : undefined);
        
        if (isE2EEPro && recipientUserId && e2eePro) {
          try {
            console.log('[sendMessage] Encrypting with E2EE Pro for recipient:', recipientUserId);
            const encrypted = await e2eePro.encryptMessageForPeerAuto(payload, recipientUserId);
            if (encrypted) {
              finalCiphertext = encrypted.ciphertext;
              finalNonce = encrypted.nonce;
              finalEncryptionVersion = 'mc-e2ee-v2-pro';
              console.log('[sendMessage] E2EE Pro encryption successful');
            } else {
              // Peer's X3DH bundle not found - they may not be online or initialized yet
              console.warn('[sendMessage] Peer X3DH bundle not found, sending unencrypted. Recipient:', recipientUserId);
              finalEncryptionVersion = undefined;
              // Message will send as plaintext and show in chat naturally
            }
          } catch (error) {
            console.warn('[sendMessage] E2EE Pro encryption failed, falling back to plaintext:', error);
            // Fall back to storing unencrypted if E2EE Pro fails
            finalEncryptionVersion = undefined;
          }
        }
        
        const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(replyTo || '');
        console.log('[sendMessage] Inserting message:', { clientId, chatId, isValidUuid, replyTo, e2eeType: isE2EEPro ? 'pro' : (e2eePassphrase ? 'passphrase' : 'none'), hasEncryption: Boolean(finalCiphertext), encryptionVersion: finalEncryptionVersion });
        
        return client.from('macrochat_messages').insert({
          conversation_id: chatId,
          sender_id: actorUserId,
          body: finalCiphertext ? '[encrypted]' : formattedBody,
          kind: 'text',
          body_ciphertext: finalCiphertext,
          body_nonce: finalNonce,
          encryption_version: finalEncryptionVersion,
          client_id: clientId,
          reply_to: isValidUuid ? replyTo : null,
        }).select('id, client_id');
      }).then((result: any) => {
        const { data, error } = result;
        if (error) {
          console.error('[sendMessage] Insert error:', error);
          updateLocalMessageStatus('failed');
          console.warn('Message sync failed', error.message);
          return;
        }

        console.log('[sendMessage] Insert success, data:', data);
        // Replace the optimistic message's id with the real UUID, matched by immutable clientId
        if (data?.[0]) {
          const realId = data[0].id as string;
          console.log('[sendMessage] Message synced with real ID:', realId);
          setChats((current) => current.map((chat) => {
            if (chat.id !== chatId) return chat;
            return {
              ...chat,
              messages: chat.messages.map((item) => item.clientId === clientId
                ? { ...item, id: realId, status: 'sent' as const }
                : item),
            };
          }));
        } else {
          updateLocalMessageStatus('sent');
        }
      }).catch((error) => {
        console.error('[sendMessage] Unexpected error:', error);
        updateLocalMessageStatus('failed');
      });
      return;
    }

    setTimeout(() => updateLocalMessageStatus('sent'), 350);
  }, [chats, e2eePassphrase, profile, e2eePro]);

  const sendMediaMessage = useCallback(async (chatId: string, input: {
    kind: Exclude<MessageKind, 'text' | 'system'>;
    uri: string;
    fileName?: string;
    mimeType?: string;
    durationMs?: number;
    replyTo?: string;
  }) => {
    const disappearingSeconds = chats.find((chat) => chat.id === chatId)?.disappearingSeconds;
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
      const { data: sessionData } = await supabase.auth.getSession();
      const actorUserId = sessionData.session?.user.id ?? profile.id;
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
        if (!uploadRes.error) {
          const signedRes = await supabase.storage.from('macrochat-media').createSignedUrl(candidatePath, 60 * 60 * 24);
          if (signedRes.data?.signedUrl) {
            path = candidatePath;
            signedUrl = signedRes.data.signedUrl;
          }
        }
      } catch (storageErr) {
        console.warn('Storage upload fallback to data URI:', storageErr);
      }

      const mediaBody = JSON.stringify({
        name: input.fileName || input.kind,
        durationMs: input.durationMs,
        mimeType: contentType,
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
  }, [chats, profile]);

  const addChat = useCallback(async (macroId: string) => {
    const normalized = macroId.trim().toUpperCase();

    const existing = chats.find((chat) => chat.macroId === normalized);
    if (existing) return existing.id;

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

    const { data: sessionData } = await supabase.auth.getSession();
    const actorUserId = sessionData.session?.user.id;
    if (!actorUserId) throw new Error('You are signed out. Please reset identity and sign in again.');

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

    if (createConversationRes.error) throw toReadableDbError('Creating private conversation failed', createConversationRes.error);

    const conversationId = createConversationRes.data.id;
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
      client.auth.getSession().then(({ data: sessionData }) => {
        const actorUserId = sessionData.session?.user.id ?? profile.id;
        return client
          .from('macrochat_conversation_members')
          .update({
            last_read_at: new Date().toISOString(),
            ...(privacySettings.readReceipts ? { receipt_read_at: new Date().toISOString() } : {}),
          })
          .eq('conversation_id', chatId)
          .eq('user_id', actorUserId);
      }).then(({ error }) => error && console.warn('Failed to mark read', error.message));
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

  const value = useMemo(() => ({
    profile,
    loading,
    chats,
    activityByChat,
    backendMode: isSupabaseConfigured ? 'supabase' as const : 'demo' as const,
    signalingReady,
    signalingEnabled,
    activeCall,
    mfaAal2,
    e2eeEnabled: Boolean(e2eePassphrase),
    e2eePro,
    privacySettings,
    blockedContacts,
    register,
    restoreProfile,
    updateProfilePicture,
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
  }), [
    profile,
    loading,
    chats,
    activityByChat,
    signalingReady,
    signalingEnabled,
    activeCall,
    mfaAal2,
    e2eePassphrase,
    e2eePro,
    privacySettings,
    blockedContacts,
    register,
    restoreProfile,
    updateProfilePicture,
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
    updateProfilePicture,
    setChatDisappearingTimer,
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
