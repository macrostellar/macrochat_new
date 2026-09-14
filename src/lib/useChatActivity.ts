import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import type { Chat, Profile, ProfileStatus } from '@/types';

export type DeviceKind = 'mobile' | 'desktop' | 'web';
export type ChatActivityState = 'typing' | 'recording' | 'screenshot';
type Presence = { device?: DeviceKind; onlineAt: string; status: ProfileStatus };
type Channel = ReturnType<NonNullable<typeof supabase>['channel']>;

export function useChatActivity(chats: Chat[], profile: Profile | null, showDevice: boolean, device: DeviceKind | null, shareTyping: boolean) {
  const [activityByChat, setActivityByChat] = useState<Record<string, { state: ChatActivityState; userId: string }>>({});
  const [presenceByUser, setPresenceByUser] = useState<Record<string, Presence>>({});
  const channels = useRef(new Map<string, Channel>());
  const userId = profile?.id;
  const profileStatus = profile?.status;
  const routes = JSON.stringify(chats.filter((chat) => chat.participantUserId).map((chat) => [chat.id, chat.participantUserId!]).sort());

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const peersByChat = new Map<string, Record<string, Presence>>();
    let disposed = false;
    const publish = (channel: Channel) => {
      if (AppState.currentState !== 'active' && Platform.OS !== 'web') return channel.untrack();
      if (Platform.OS === 'web' && document.hidden) return channel.untrack();
      return channel.track({
        device: showDevice ? device ?? (Platform.OS === 'web' ? 'web' : 'mobile') : null,
        onlineAt: new Date().toISOString(),
        status: profileStatus ?? 'online',
      });
    };
    for (const [chatId, peerId] of JSON.parse(routes) as [string, string][]) {
      const channel = client.channel(`macrochat-conversation-${chatId}`, { config: { presence: { key: userId } } });
      channels.current.set(chatId, channel);
      channel.on('broadcast', { event: 'chat-activity' }, ({ payload }) => {
        if (disposed || !payload || payload.userId === userId || payload.userId !== peerId) return;
        clearTimeout(timers.get(chatId));
        const clear = () => setActivityByChat((current) => {
          const updated = { ...current };
          delete updated[chatId];
          return updated;
        });
        if (!['typing', 'recording', 'screenshot'].includes(payload.state)) return clear();
        setActivityByChat((current) => ({ ...current, [chatId]: { state: payload.state, userId: peerId } }));
        timers.set(chatId, setTimeout(clear, 1800));
      }).on('presence', { event: 'sync' }, () => {
        if (disposed) return;
        const entries = channel.presenceState<Presence>()[peerId] ?? [];
        const entry = [...entries].sort((first, second) => second.onlineAt.localeCompare(first.onlineAt))[0];
        const peer: Record<string, Presence> = {};
        if (entry) peer[peerId] = {
          onlineAt: entry.onlineAt,
          status: ['online', 'busy', 'away', 'offline'].includes(entry.status) ? entry.status : 'online',
          device: entry.status !== 'offline' && ['mobile', 'desktop', 'web'].includes(entry.device ?? '') ? entry.device : undefined,
        };
        peersByChat.set(chatId, peer);
        setPresenceByUser(Object.assign({}, ...peersByChat.values()));
      }).subscribe((status) => {
        if (status === 'SUBSCRIBED' && !disposed) void publish(channel);
      });
    }
    const publishAll = () => channels.current.forEach((channel) => { void publish(channel); });
    const appState = AppState.addEventListener('change', publishAll);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', publishAll);
    const activeChannels = channels.current;
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      appState.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', publishAll);
      activeChannels.forEach((channel) => { void client.removeChannel(channel); });
      activeChannels.clear();
      setActivityByChat({});
      setPresenceByUser({});
    };
  }, [routes, userId, profileStatus, showDevice, device]);

  const sendChatActivity = useCallback((chatId: string, state: ChatActivityState | null) => {
    if (!profile || (state && !shareTyping)) return;
    void channels.current.get(chatId)?.send({ type: 'broadcast', event: 'chat-activity', payload: { userId: profile.id, state } });
  }, [profile, shareTyping]);

  return { activityByChat, presenceByUser, sendChatActivity };
}