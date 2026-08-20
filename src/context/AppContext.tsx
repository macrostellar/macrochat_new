import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import type { Chat, Message, MessageKind, Profile } from '@/types';
import { demoChats } from '@/lib/demo';
import { generateMacroId, localId } from '@/lib/id';
import { ensureAnonymousSession, getSupabaseAccessToken, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { connectCallSignaling, disconnectCallSignaling, getCallSocket, updateCallHandlers } from '@/lib/calls';
import {
  clearE2EEPassphrase,
  decryptTextWithPassphrase,
  encryptTextWithPassphrase,
  readE2EEPassphrase,
  writeE2EEPassphrase,
} from '@/lib/e2ee';

const PROFILE_KEY = 'macrochat.profile';

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
  register: (displayName: string) => Promise<Profile>;
  signOut: () => Promise<void>;
  refreshSecurityState: () => Promise<void>;
  enableE2EE: (passphrase: string) => Promise<void>;
  disableE2EE: () => Promise<void>;
  unlockE2EE: (passphrase: string) => Promise<boolean>;
  sendMessage: (chatId: string, text: string, replyTo?: string) => void;
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
  macrochat_profiles: {
    id: string;
    macro_id: string;
    display_name: string;
    avatar_color: string;
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

function parseMediaBody(body: string | null | undefined): { name?: string; durationMs?: number; mimeType?: string } {
  if (!body) return {};
  try {
    const parsed = JSON.parse(body) as { name?: string; durationMs?: number; mimeType?: string };
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : undefined,
      mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : undefined,
    };
  } catch {
    return {};
  }
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

export function AppProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>(isSupabaseConfigured ? [] : demoChats);
  const [activityByChat, setActivityByChat] = useState<Record<string, { state: 'typing' | 'recording'; userId: string }>>({});
  const [signalingReady, setSignalingReady] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [mfaAal2, setMfaAal2] = useState(false);
  const [e2eePassphrase, setE2eePassphrase] = useState<string | null>(null);
  const syncChannelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const signalingUrl = process.env.EXPO_PUBLIC_SIGNALING_URL;
  const signalingEnabled = Boolean(signalingUrl);

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
        return;
      }
    } catch {
      // Fallback below
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const aal = sessionData.session?.user?.app_metadata?.aal ?? sessionData.session?.user?.user_metadata?.aal;
    setMfaAal2(aal === 'aal2');
  }, []);

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
        .select('id,title,is_group,updated_at')
        .in('id', conversationIds),
      supabase
        .from('macrochat_conversation_members')
        .select('conversation_id,user_id,role,last_read_at,macrochat_profiles(id,macro_id,display_name,avatar_color,last_seen)')
        .in('conversation_id', conversationIds),
      supabase
        .from('macrochat_messages')
        .select('id,client_id,conversation_id,sender_id,body,kind,media_path,body_ciphertext,body_nonce,encryption_version,reply_to,created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true }),
    ]);

    if (conversationsRes.error || conversationMembersRes.error || messagesRes.error) {
      console.warn('Failed to load conversations/messages');
      return;
    }

    const members = (conversationMembersRes.data ?? []) as unknown as ConversationMemberRow[];
    const messages = (messagesRes.data ?? []) as MessageRow[];
    const mediaPaths = [...new Set(messages.map((row) => row.media_path).filter((path): path is string => Boolean(path)))];
    const signedByPath = new Map<string, string>();

    if (mediaPaths.length > 0) {
      const signedRes = await supabase.storage.from('macrochat-media').createSignedUrls(mediaPaths, 60 * 60 * 24);
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
      const myLastReadAt = membershipByConversation.get(conversation.id);

      const mappedMessages: Message[] = messages
        .filter((row) => row.conversation_id === conversation.id)
        .map((row) => {
          const mediaMeta = parseMediaBody(row.body);
          const encrypted = Boolean(row.body_ciphertext && row.body_nonce && row.encryption_version);
          let displayText = row.body;
          if (encrypted) {
            if (e2eePassphrase) {
              const decrypted = decryptTextWithPassphrase(row.body_ciphertext!, row.body_nonce!, e2eePassphrase);
              displayText = decrypted ?? '[Unable to decrypt]';
            } else {
              displayText = '[Encrypted message]';
            }
          } else if (row.kind !== 'text' && row.kind !== 'system') {
            displayText = mediaMeta.name || row.body || row.kind;
          }

          return {
            id: row.client_id || row.id,
            chatId: row.conversation_id,
            senderId: row.sender_id === actorUserId ? 'me' : row.sender_id,
            text: displayText,
            kind: row.kind,
            mediaPath: row.media_path ?? undefined,
            mediaUrl: row.media_path ? signedByPath.get(row.media_path) : undefined,
            fileName: mediaMeta.name,
            mimeType: mediaMeta.mimeType,
            durationMs: mediaMeta.durationMs,
            encrypted,
            encryptionVersion: row.encryption_version ?? undefined,
            ciphertext: row.body_ciphertext ?? undefined,
            nonce: row.body_nonce ?? undefined,
            createdAt: row.created_at,
            status: row.sender_id === actorUserId ? 'sent' : 'delivered',
            replyTo: row.reply_to ?? undefined,
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
        online: false,
        lastSeen,
        unread,
        isGroup: conversation.is_group,
        messages: mappedMessages,
      };
    });

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
  }, [e2eePassphrase, profile]);

  useEffect(() => {
    readProfileFromStorage()
      .then((saved) => saved && setProfile(JSON.parse(saved) as Profile))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshSecurityState().catch(() => undefined);
  }, [refreshSecurityState]);

  useEffect(() => {
    if (!supabase || !profile) {
      if (!isSupabaseConfigured) setChats(demoChats);
      setActivityByChat({});
      return;
    }

    loadChatsFromBackend().catch(() => undefined);

    const channel = supabase.channel(`macrochat-sync-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'macrochat_messages' }, () => {
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

    syncChannelRef.current = channel;

    return () => {
      syncChannelRef.current = null;
      supabase?.removeChannel(channel);
    };
  }, [loadChatsFromBackend, profile]);

  const sendChatActivity = useCallback((chatId: string, state: 'typing' | 'recording' | null) => {
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
  }, [profile]);

  useEffect(() => {
    if (!profile || !supabase || !signalingUrl) {
      setSignalingReady(false);
      disconnectCallSignaling();
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
        },
        onRejected: (payload) => {
          if (!payload?.callId) return;
          setActiveCall((current) => {
            if (!current || current.callId !== payload.callId) return current;
            return null;
          });
        },
        onHangup: (payload) => {
          if (!payload?.callId) return;
          setActiveCall((current) => {
            if (!current || current.callId !== payload.callId) return current;
            return null;
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
  }, [profile, signalingUrl]);

  const register = useCallback(async (displayName: string) => {
    const session = await ensureAnonymousSession();
    const next: Profile = {
      id: session?.user.id ?? localId('anonymous'),
      macroId: generateMacroId(),
      displayName: displayName.trim(),
      avatarColor: '#55B9FF',
    };

    if (supabase && session) {
      const { error } = await supabase.from('macrochat_profiles').upsert({
        id: next.id,
        macro_id: next.macroId,
        display_name: next.displayName,
        avatar_color: next.avatarColor,
      });
      if (error) throw error;
    }

    await writeProfileToStorage(next);
    setProfile(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    await clearProfileFromStorage();
    disconnectCallSignaling();
    setProfile(null);
    setActiveCall(null);
    setSignalingReady(false);
    setMfaAal2(false);
    setChats(isSupabaseConfigured ? [] : demoChats);
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
    await writeE2EEPassphrase(trial);
    setE2eePassphrase(trial);
    return true;
  }, []);

  const sendMessage = useCallback((chatId: string, text: string, replyTo?: string) => {
    const payload = text.trim();
    if (!payload) return;

    const encryptedPayload = e2eePassphrase ? encryptTextWithPassphrase(payload, e2eePassphrase) : null;
    const message: Message = {
      id: localId('message'),
      chatId,
      senderId: 'me',
      text: payload,
      kind: 'text',
      encrypted: Boolean(encryptedPayload),
      encryptionVersion: encryptedPayload?.version,
      ciphertext: encryptedPayload?.ciphertext,
      nonce: encryptedPayload?.nonce,
      createdAt: new Date().toISOString(),
      status: 'sending',
      replyTo,
    };

    setChats((current) => current.map((chat) => chat.id === chatId
      ? { ...chat, unread: 0, messages: [...chat.messages, message] }
      : chat));

    const updateLocalMessageStatus = (status: Message['status']) => {
      setChats((current) => current.map((chat) => chat.id === chatId
        ? {
            ...chat,
            messages: chat.messages.map((item) => item.id === message.id ? { ...item, status } : item),
          }
        : chat));
    };

    if (supabase && profile) {
      const client = supabase;
      client.auth.getSession().then(({ data: sessionData }) => {
        const actorUserId = sessionData.session?.user.id ?? profile.id;
        return client.from('macrochat_messages').insert({
          conversation_id: chatId,
          sender_id: actorUserId,
          body: encryptedPayload ? '[encrypted]' : payload,
          kind: 'text',
          body_ciphertext: encryptedPayload?.ciphertext,
          body_nonce: encryptedPayload?.nonce,
          encryption_version: encryptedPayload?.version,
          client_id: message.id,
          reply_to: replyTo,
        });
      }).then(({ error }) => {
        if (error) {
          updateLocalMessageStatus('failed');
          console.warn('Message sync failed', error.message);
          if (error.message?.toLowerCase().includes('e2ee_required')) {
            console.warn('Database schema is missing macrochat_conversations.e2ee_required. Run supabase/e2ee-phase1-migration.sql and retry.');
          }
          return;
        }

        updateLocalMessageStatus('sent');
      });
      return;
    }

    setTimeout(() => updateLocalMessageStatus('sent'), 350);
  }, [e2eePassphrase, profile]);

  const sendMediaMessage = useCallback(async (chatId: string, input: {
    kind: Exclude<MessageKind, 'text' | 'system'>;
    uri: string;
    fileName?: string;
    mimeType?: string;
    durationMs?: number;
    replyTo?: string;
  }) => {
    const localMessage: Message = {
      id: localId('message'),
      chatId,
      senderId: 'me',
      text: input.fileName || input.kind,
      kind: input.kind,
      mediaUrl: input.uri,
      fileName: input.fileName,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      createdAt: new Date().toISOString(),
      status: 'sending',
      replyTo: input.replyTo,
    };

    setChats((current) => current.map((chat) => chat.id === chatId
      ? { ...chat, unread: 0, messages: [...chat.messages, localMessage] }
      : chat));

    const updateLocalMessage = (patch: Partial<Message>) => {
      setChats((current) => current.map((chat) => chat.id === chatId
        ? {
            ...chat,
            messages: chat.messages.map((item) => item.id === localMessage.id ? { ...item, ...patch } : item),
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
      const uploadBody = await readUriAsUploadBody(input.uri);

      const ext = inferExtension(input.fileName, input.mimeType || undefined);
      const path = `${chatId}/${actorUserId}/${Date.now()}-${localMessage.id}.${ext}`;
      const contentType = input.mimeType || 'application/octet-stream';

      const uploadRes = await supabase.storage.from('macrochat-media').upload(path, uploadBody, {
        contentType,
        upsert: false,
      });
      if (uploadRes.error) throw uploadRes.error;

      const signedRes = await supabase.storage.from('macrochat-media').createSignedUrl(path, 60 * 60 * 24);
      const mediaBody = JSON.stringify({ name: input.fileName, durationMs: input.durationMs, mimeType: contentType });
      const insertRes = await supabase.from('macrochat_messages').insert({
        conversation_id: chatId,
        sender_id: actorUserId,
        body: mediaBody,
        kind: input.kind,
        media_path: path,
        client_id: localMessage.id,
        reply_to: input.replyTo,
      });

      if (insertRes.error) throw insertRes.error;

      updateLocalMessage({
        status: 'sent',
        mediaPath: path,
        mediaUrl: signedRes.data?.signedUrl || input.uri,
        mimeType: contentType,
      });
    } catch (error) {
      updateLocalMessage({ status: 'failed' });
      console.warn('Media message sync failed', error instanceof Error ? error.message : error);
    }
  }, [profile]);

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

    loadChatsFromBackend().catch((error) => {
      console.warn('Failed to refresh chats after creating conversation', error);
    });
    return conversationId;
  }, [chats, loadChatsFromBackend, profile]);

  const markRead = useCallback((chatId: string) => {
    setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, unread: 0 } : chat));
    if (supabase && profile) {
      const client = supabase;
      client.auth.getSession().then(({ data: sessionData }) => {
        const actorUserId = sessionData.session?.user.id ?? profile.id;
        return client
          .from('macrochat_conversation_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('conversation_id', chatId)
          .eq('user_id', actorUserId);
      }).then(({ error }) => error && console.warn('Failed to mark read', error.message));
    }
  }, [profile]);

  const startCall = useCallback(async (chatId: string, video: boolean) => {
    if (!signalingEnabled) throw new Error('Signaling URL is not configured. Add EXPO_PUBLIC_SIGNALING_URL.');
    if (!profile) throw new Error('You must be signed in first.');

    const chat = chats.find((item) => item.id === chatId);
    if (!chat || !chat.participantUserId) throw new Error('Direct call target is unavailable for this chat.');

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
  }, [chats, profile, signalingEnabled]);

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
    setActiveCall(null);
  }, [activeCall]);

  const endActiveCall = useCallback(() => {
    const socket = getCallSocket();
    if (socket && activeCall) {
      socket.emit('call:hangup', { callId: activeCall.callId, toUserId: activeCall.peerUserId });
    }
    setActiveCall(null);
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
    register,
    signOut,
    refreshSecurityState,
    enableE2EE,
    disableE2EE,
    unlockE2EE,
    sendMessage,
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
    register,
    signOut,
    refreshSecurityState,
    enableE2EE,
    disableE2EE,
    unlockE2EE,
    sendMessage,
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
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
