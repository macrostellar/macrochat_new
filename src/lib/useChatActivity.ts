import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { supabase } from './supabase';
import type { Chat, Profile, ProfileStatus } from '@/types';

export type DeviceKind = 'mobile' | 'desktop' | 'web';
export type ChatActivityState = 'typing' | 'recording' | 'screenshot';
type Presence = { device?: DeviceKind; onlineAt: string; status: ProfileStatus };
type Channel = ReturnType<NonNullable<typeof supabase>['channel']>;

export function normalizePresenceStatus(value: unknown): ProfileStatus {
  return value === 'busy' || value === 'away' || value === 'offline' || value === 'online'
    ? value
    : 'online';
}

export function presenceLabelForDisplay(status: ProfileStatus | undefined): string {
  if (status === 'busy') return 'Busy';
  if (status === 'away') return 'Away';
  if (status === 'offline') return 'Offline';
  return 'Online';
}

// Each open channel is a WebSocket subscription, so only the open chat and the most recent chats get one.
export const MAX_ACTIVITY_CHANNELS = 8;

export function selectActivityRoutes(chats: Pick<Chat, 'id' | 'participantUserId'>[], activeChatId: string | null | undefined): [string, string][] {
  const direct = chats.filter((chat) => chat.participantUserId);
  const selected = direct.slice(0, MAX_ACTIVITY_CHANNELS);
  const active = activeChatId ? direct.find((chat) => chat.id === activeChatId) : undefined;
  if (active && !selected.includes(active)) selected.push(active);
  return selected.map((chat) => [chat.id, chat.participantUserId!]);
}

export function useChatActivity(chats: Chat[], profile: Profile | null, showDevice: boolean, device: DeviceKind | null, shareTyping: boolean, activeChatId?: string | null) {
  const [activityByChat, setActivityByChat] = useState<Record<string, { state: ChatActivityState; userId: string }>>({});
  const [presenceByUser, setPresenceByUser] = useState<Record<string, Presence>>({});
  const channels = useRef(new Map<string, Channel>());
  const userId = profile?.id;
  const profileStatus = profile?.status;
  
  // Stable routes ref: only update when the selected chat IDs or participant IDs actually change
  const routesRef = useRef<[string, string][]>([]);
  const routesKey = useRef<string>('');
  const nextRoutes = selectActivityRoutes(chats, activeChatId);
  const currentRoutesKey = nextRoutes.map(([chatId, peerId]) => `${chatId}:${peerId}`).sort().join('|');

  if (currentRoutesKey !== routesKey.current) {
    routesKey.current = currentRoutesKey;
    routesRef.current = nextRoutes;
  }

  // Held in a ref so status/device edits re-track on live channels instead of recreating them.
  const payloadRef = useRef({ showDevice, device, status: profileStatus });
  payloadRef.current = { showDevice, device, status: profileStatus };

  const publish = useCallback((channel: Channel) => {
    if (String(channel.state) !== 'joined') return;
    if (AppState.currentState !== 'active' && Platform.OS !== 'web') return channel.untrack();
    if (Platform.OS === 'web' && document.hidden) return;
    const { showDevice: shareDevice, status } = payloadRef.current;
    // Web platform ALWAYS uses 'web' device type regardless of mobile/desktop setting
    const finalDevice = shareDevice ? 'web' : undefined;
    return channel.track({
      device: finalDevice,
      onlineAt: new Date().toISOString(),
      status: normalizePresenceStatus(status),
    });
  }, []);

  useEffect(() => {
    // Publish to all channels on visibility/app state change without recreating channels
    channels.current.forEach((channel) => { void publish(channel); });
  }, [publish, profileStatus, showDevice, device]);

  const syncChannels = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const activeChannels = channels.current;
    let disposed = false;

    const closeChannel = (chatId: string) => {
      const channel = activeChannels.get(chatId);
      if (!channel) return;
      activeChannels.delete(chatId);
      clearTimeout(timers.get(chatId));
      timers.delete(chatId);
      void client.removeChannel(channel);
    };

    const openChannel = (chatId: string, peerId: string) => {
      const channel = client.channel(`macrochat-conversation-${chatId}`, { config: { presence: { key: userId } } });
      activeChannels.set(chatId, channel);
      channel.on('broadcast', { event: 'chat-activity' }, ({ payload }) => {
        if (disposed || !payload || payload.userId === userId || payload.userId !== peerId) return;
        clearTimeout(timers.get(chatId));
        const clear = () => setActivityByChat((current) => {
          if (!(chatId in current)) return current;
          const updated = { ...current };
          delete updated[chatId];
          return updated;
        });
        if (!['typing', 'recording', 'screenshot'].includes(payload.state)) return clear();
        setActivityByChat((current) => ({ ...current, [chatId]: { state: payload.state, userId: peerId } }));
        timers.set(chatId, setTimeout(clear, 3000));
      }).on('presence', { event: 'sync' }, () => {
        if (disposed) return;
        const entries = channel.presenceState<Presence>()[peerId] ?? [];
        const entry = [...entries].sort((first, second) => second.onlineAt.localeCompare(first.onlineAt))[0];
        // Only update if we have presence data - don't delete on transient sync events
        if (!entry) return;

        setPresenceByUser((current) => {
          const normalizedStatus = normalizePresenceStatus(entry.status);
          const normalizedDevice = entry.device && ['mobile', 'desktop', 'web'].includes(entry.device) ? entry.device : undefined;
          return {
            ...current,
            [peerId]: {
              onlineAt: entry.onlineAt,
              status: normalizedStatus,
              device: normalizedStatus !== 'offline' ? normalizedDevice : undefined,
            },
          };
        });
      }).on('presence', { event: 'leave' }, () => {
        if (disposed) return;
        // Only delete on explicit leave events, not transient syncs
        setPresenceByUser((current) => {
          if (!(peerId in current)) return current;
          const next = { ...current };
          delete next[peerId];
          return next;
        });
      }).subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') void publish(channel);
      });
    };

    // Opens channels that are newly wanted and closes ones that are not, so opening a chat never rebuilds the rest.
    const sync = () => {
      const wanted = new Map(routesRef.current);
      const peerIds = new Set(wanted.values());
      for (const chatId of [...activeChannels.keys()]) {
        if (!wanted.has(chatId)) closeChannel(chatId);
      }
      for (const [chatId, peerId] of wanted) {
        if (!activeChannels.has(chatId)) openChannel(chatId, peerId);
      }
      setActivityByChat((current) => {
        const kept = Object.entries(current).filter(([chatId]) => wanted.has(chatId));
        return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
      });
      setPresenceByUser((current) => {
        const kept = Object.entries(current).filter(([id]) => peerIds.has(id));
        return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
      });
    };
    syncChannels.current = sync;
    sync();

    const publishAll = () => activeChannels.forEach((channel) => { void publish(channel); });
    const appState = AppState.addEventListener('change', publishAll);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', publishAll);
    return () => {
      disposed = true;
      syncChannels.current = null;
      timers.forEach(clearTimeout);
      appState.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', publishAll);
      activeChannels.forEach((channel) => { void client.removeChannel(channel); });
      activeChannels.clear();
      setActivityByChat({});
    };
  }, [userId, publish]);

  useEffect(() => {
    syncChannels.current?.();
  }, [currentRoutesKey]);

  useEffect(() => {
    if (userId) return;
    setPresenceByUser({});
    setActivityByChat({});
  }, [userId]);

  const sendChatActivity = useCallback((chatId: string, state: ChatActivityState | null) => {
    if (!profile || (state && !shareTyping)) return;
    const channel = channels.current.get(chatId);
    if (!channel || String(channel.state) !== 'joined') return;
    void channel.send({ type: 'broadcast', event: 'chat-activity', payload: { userId: profile.id, state } });
  }, [profile, shareTyping]);

  return { activityByChat, presenceByUser, sendChatActivity };
}