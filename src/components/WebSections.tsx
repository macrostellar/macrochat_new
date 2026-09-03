import { useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Avatar, DEFAULT_PROFILE_AVATARS } from '@/components/Avatar';
import { CallMedia } from '@/components/CallMedia';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import type { Chat } from '@/types';

type Section = 'updates' | 'calls' | 'people' | 'settings';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function callOutcomeLabel(item: { incoming: boolean; outcome: string; durationSeconds: number }) {
  if (item.outcome === 'missed') return 'Missed';
  if (item.outcome === 'rejected') return item.incoming ? 'Declined' : 'Declined by contact';
  if (item.outcome === 'cancelled') return 'Cancelled';
  const minutes = Math.floor(item.durationSeconds / 60);
  const seconds = item.durationSeconds % 60;
  return `${item.incoming ? 'Incoming' : 'Outgoing'} \u00b7 ${minutes}:${String(seconds).padStart(2, '0')}`;
}

const settingsItems: { id: string; icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; route?: '/security/account' | '/security/privacy' | '/security/mfa' | '/security/e2ee' }[] = [
  { id: 'account', icon: 'person-circle-outline', title: 'Account and recovery', detail: 'Username-only, email, phone, or Google', route: '/security/account' },
  { id: 'privacy', icon: 'shield-checkmark-outline', title: 'Privacy', detail: 'Typing activity, calls, and identity protection', route: '/security/privacy' },
  { id: 'notifications', icon: 'notifications-outline', title: 'Notifications', detail: 'Messages, groups, and calls' },
  { id: 'appearance', icon: 'color-palette-outline', title: 'Appearance', detail: 'MacroChat dark navy theme' },
  { id: 'devices', icon: 'key-outline', title: 'Linked devices', detail: 'Manage trusted sessions' },
  { id: 'storage', icon: 'server-outline', title: 'Data and storage', detail: 'Media quality and network usage' },
  { id: 'mfa', icon: 'shield-checkmark', title: 'Two-factor authentication', detail: 'Authenticator verification', route: '/security/mfa' },
  { id: 'e2ee', icon: 'lock-closed-outline', title: 'Message encryption', detail: 'Manage end-to-end encryption', route: '/security/e2ee' },
];

function WebRail({ active }: { active: Section | 'chats' }) {
  const { profile } = useApp();
  const links: { id: Section | 'chats'; icon: keyof typeof Ionicons.glyphMap; route: '/(tabs)' | '/updates' | '/calls' | '/people' }[] = [
    { id: 'chats', icon: 'chatbubble-ellipses', route: '/(tabs)' },
    { id: 'updates', icon: 'radio-outline', route: '/updates' },
    { id: 'calls', icon: 'call-outline', route: '/calls' },
    { id: 'people', icon: 'people-outline', route: '/people' },
  ];

  return (
    <View style={styles.rail}>
      <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
      <View style={styles.railNav}>
        {links.map((item) => (
          <Pressable key={item.id} accessibilityLabel={item.id} style={[styles.railButton, active === item.id && styles.railActive]} onPress={() => router.push(item.route)}>
            <Ionicons name={item.icon} size={22} color={active === item.id ? colors.neon : colors.muted} />
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityLabel="Settings" style={[styles.railButton, active === 'settings' && styles.railActive]} onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={22} color={active === 'settings' ? colors.neon : colors.muted} />
      </Pressable>
      <View style={styles.profileAvatar}><Avatar name={profile?.displayName || 'Macro'} color={profile?.avatarColor || colors.blue} size={34} online imageUrl={profile?.avatarUrl} /></View>
    </View>
  );
}

function Workspace({ active, title, subtitle, action, sidebar, children }: { active: Section; title: string; subtitle: string; action?: React.ReactNode; sidebar: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.desktop}>
      <WebRail active={active} />
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <View><Text style={styles.brand}>MACROCHAT</Text><Text style={styles.sidebarTitle}>{title}</Text></View>
          {action}
        </View>
        <Text style={styles.sidebarSubtitle}>{subtitle}</Text>
        {sidebar}
      </View>
      <View style={styles.detail}>{children}</View>
    </View>
  );
}

function Search({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.search}><Ionicons name="search" size={18} color={colors.muted} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.searchInput, { outlineStyle: 'none' } as never]} /></View>;
}

function EmptyDetail({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return <View style={styles.emptyDetail}><View style={styles.emptyIcon}><Ionicons name={icon} size={42} color={colors.blue} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

export function WebUpdates() {
  const { updates, markUpdateViewed, deleteUpdate } = useApp();
  const [query, setQuery] = useState('');
  const [viewerItems, setViewerItems] = useState<typeof updates>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const mine = useMemo(() => updates.filter((item) => item.mine), [updates]);
  const others = useMemo(() => updates.filter((item) => !item.mine && item.name.toLowerCase().includes(query.toLowerCase())), [updates, query]);

  const activeStatus = viewerItems[viewerIndex] || null;

  const openStatusViewer = (items: typeof updates, startIndex = 0) => {
    if (!items || items.length === 0) return;
    setViewerItems(items);
    setViewerIndex(startIndex >= 0 && startIndex < items.length ? startIndex : 0);
    if (items[startIndex]) {
      void markUpdateViewed(items[startIndex].id);
    }
  };

  const closeViewer = () => {
    setViewerItems([]);
    setViewerIndex(0);
  };

  const navigateViewer = (direction: 'next' | 'prev') => {
    if (direction === 'next') {
      if (viewerIndex < viewerItems.length - 1) {
        const nextIdx = viewerIndex + 1;
        setViewerIndex(nextIdx);
        void markUpdateViewed(viewerItems[nextIdx].id);
      } else {
        closeViewer();
      }
    } else {
      if (viewerIndex > 0) {
        setViewerIndex(viewerIndex - 1);
      }
    }
  };

  const handleDeleteCurrentStatus = async () => {
    if (!activeStatus || !activeStatus.mine) return;
    const targetId = activeStatus.id;
    try {
      await deleteUpdate(targetId);
      const updatedList = viewerItems.filter((item) => item.id !== targetId);
      if (updatedList.length === 0) {
        closeViewer();
      } else {
        setViewerItems(updatedList);
        if (viewerIndex >= updatedList.length) {
          setViewerIndex(updatedList.length - 1);
        }
      }
    } catch (error) {
      console.error('Failed to delete status:', error);
    }
  };

  return (
    <Workspace
      active="updates"
      title="Status"
      subtitle="Disappearing photos, videos, and text."
      action={
        <Pressable
          accessibilityLabel="Add new status"
          style={styles.primaryIcon}
          onPress={() => router.push('/camera?intent=update')}
        >
          <Ionicons name="add" size={22} color={colors.navy950} />
        </Pressable>
      }
      sidebar={
        <>
          <Search value={query} onChangeText={setQuery} placeholder="Search status" />
          <Pressable
            style={styles.myUpdate}
            onPress={() => {
              if (mine.length > 0) {
                openStatusViewer(mine, 0);
              } else {
                router.push('/camera?intent=update');
              }
            }}
          >
            <View style={styles.addUpdate}>
              {mine.length > 0 && mine[0].mediaUrl ? (
                <Image source={{ uri: mine[0].mediaUrl }} style={{ width: '100%', height: '100%', borderRadius: 23 }} />
              ) : (
                <Ionicons name="add" size={23} color={colors.navy950} />
              )}
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>My status</Text>
              <Text style={styles.rowMeta}>
                {mine.length > 0 ? `${timeAgo(mine[0].createdAt)} · ${mine.length} active` : 'Click to add status update'}
              </Text>
            </View>
            {mine.length > 0 && (
              <Pressable
                style={{ padding: 6 }}
                onPress={(e) => {
                  e.stopPropagation();
                  router.push('/camera?intent=update');
                }}
              >
                <Ionicons name="add-circle" size={26} color={colors.neon} />
              </Pressable>
            )}
          </Pressable>

          <Text style={styles.sectionLabel}>RECENT</Text>
          <FlatList
            data={others}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.emptyList}>No recent updates from contacts.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.listRow, activeStatus?.id === item.id && styles.listRowActive]}
                onPress={() => openStatusViewer(others.filter((o) => o.userId === item.userId || o.name === item.name), 0)}
              >
                <View style={[styles.updateRing, item.viewed && styles.updateRingViewed]}>
                  <Avatar name={item.name} color={item.avatarColor} size={45} />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowMeta}>{timeAgo(item.createdAt)}</Text>
                </View>
              </Pressable>
            )}
          />
        </>
      }
    >
      {activeStatus ? (
        <View style={styles.webStatusOverlay}>
          {/* Progress Bar Segments */}
          <View style={styles.statusSegmentRow}>
            {viewerItems.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.statusSegment,
                  {
                    backgroundColor: idx <= viewerIndex ? colors.white : 'rgba(255,255,255,0.3)',
                  },
                ]}
              />
            ))}
          </View>

          {/* Status Header */}
          <View style={styles.webStatusHeader}>
            <Pressable onPress={closeViewer} style={styles.webStatusBackButton}>
              <Ionicons name="arrow-back" size={22} color={colors.white} />
            </Pressable>
            <Avatar name={activeStatus.mine ? 'You' : activeStatus.name} color={activeStatus.avatarColor} size={40} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.webStatusName}>{activeStatus.mine ? 'You' : activeStatus.name}</Text>
              <Text style={styles.webStatusTime}>{timeAgo(activeStatus.createdAt)}</Text>
            </View>
            {activeStatus.mine && (
              <Pressable onPress={handleDeleteCurrentStatus} style={styles.webStatusDeleteButton}>
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </Pressable>
            )}
            <Pressable onPress={closeViewer} style={{ padding: 6, marginLeft: 8 }}>
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
          </View>

          {/* Canvas & Navigation Controls */}
          <View style={styles.webStatusCanvas}>
            {viewerIndex > 0 && (
              <Pressable style={styles.webNavLeft} onPress={() => navigateViewer('prev')}>
                <Ionicons name="chevron-back" size={36} color={colors.white} />
              </Pressable>
            )}

            <View style={styles.webStatusMediaContainer}>
              {activeStatus.kind === 'photo' && activeStatus.mediaUrl ? (
                <Image source={{ uri: activeStatus.mediaUrl }} style={styles.webStatusImage} resizeMode="contain" />
              ) : activeStatus.kind === 'video' ? (
                <View style={styles.webStatusVideoPlaceholder}>
                  <Ionicons name="videocam" size={60} color={colors.neon} />
                  <Text style={styles.webStatusMessage}>Video status update</Text>
                </View>
              ) : (
                <Text style={styles.webStatusMessage}>{activeStatus.caption || 'Status update'}</Text>
              )}
            </View>

            <Pressable style={styles.webNavRight} onPress={() => navigateViewer('next')}>
              <Ionicons name="chevron-forward" size={36} color={colors.white} />
            </Pressable>
          </View>

          {/* Bottom Bar: Views for mine, Reply box for contacts */}
          <View style={styles.webStatusFooter}>
            {activeStatus.mine ? (
              <View style={styles.webStatusViewsRow}>
                <Ionicons name="eye-outline" size={18} color={colors.muted} />
                <Text style={styles.webStatusViewsText}>0 views</Text>
              </View>
            ) : (
              <View style={styles.webStatusReplyBox}>
                <TextInput
                  placeholder="Type a reply..."
                  placeholderTextColor={colors.muted}
                  style={[styles.webStatusReplyInput, { outlineStyle: 'none' } as never]}
                />
                <Ionicons name="send" size={20} color={colors.neon} />
              </View>
            )}
          </View>
        </View>
      ) : (
        <EmptyDetail icon="radio-outline" title="Share statuses" text="Share photos, videos and text that disappear after 24 hours." />
      )}
    </Workspace>
  );
}

export function WebCalls() {
  const { chats, signalingEnabled, signalingReady, activeCall, callHistory, startAudioCall, startVideoCall, endActiveCall } = useApp();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const contacts = useMemo(() => chats.filter((chat) => !chat.isGroup && chat.participantUserId && chat.name.toLowerCase().includes(query.toLowerCase())), [chats, query]);
  const selected = contacts.find((chat) => chat.id === selectedId) ?? contacts[0];
  const activeContact = activeCall ? chats.find((chat) => chat.participantUserId === activeCall.peerUserId) : null;

  const placeCall = async (chat: Chat, video: boolean) => {
    try {
      if (video) await startVideoCall(chat.id);
      else await startAudioCall(chat.id);
    } catch (error) {
      Alert.alert('Call unavailable', error instanceof Error ? error.message : 'Try again.');
    }
  };

  return (
    <Workspace
      active="calls"
      title="Calls"
      subtitle={signalingEnabled ? (signalingReady ? 'Signaling connected' : 'Signaling reconnecting') : 'Call signaling is not configured'}
      action={<View style={[styles.connectionDot, { backgroundColor: signalingEnabled && signalingReady ? colors.neon : colors.danger }]} />}
      sidebar={
        <>
          <Search value={query} onChangeText={setQuery} placeholder="Search contacts to call" />
          <Text style={styles.sectionLabel}>CONTACTS</Text>
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.emptyList}>Start a direct chat to call someone.</Text>}
            renderItem={({ item }) => (
              <Pressable style={[styles.listRow, selected?.id === item.id && styles.listRowActive]} onPress={() => setSelectedId(item.id)}>
                <Avatar name={item.name} color={item.avatarColor} size={45} online={item.online} />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowMeta}>{item.online ? 'Available' : item.lastSeen}</Text>
                </View>
                <Pressable accessibilityLabel={`Call ${item.name}`} style={styles.rowAction} onPress={() => placeCall(item, false)}>
                  <Ionicons name="call-outline" size={18} color={colors.blue} />
                </Pressable>
              </Pressable>
            )}
          />
          <Text style={styles.sectionLabel}>RECENT</Text>
          {callHistory.length === 0 ? (
            <Text style={styles.emptyList}>No calls yet.</Text>
          ) : (
            callHistory.map((item) => {
              const peer = chats.find((chat) => chat.participantUserId === item.peerUserId);
              return (
                <View key={item.id} style={styles.listRow}>
                  <Avatar name={peer?.name || 'Contact'} color={peer?.avatarColor || colors.blue} size={42} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{peer?.name || 'Contact'}</Text>
                    <Text style={[styles.rowMeta, item.outcome === 'missed' && styles.missedCall]}>{callOutcomeLabel(item)} · {timeAgo(item.startedAt)}</Text>
                  </View>
                  <Ionicons name={item.video ? 'videocam-outline' : 'call-outline'} size={18} color={item.outcome === 'missed' ? colors.danger : colors.muted} />
                </View>
              );
            })
          )}
        </>
      }
    >
      {activeCall && activeContact ? (
        <View style={styles.contactDetail}>
          <Avatar name={activeContact.name} color={activeContact.avatarColor} size={90} online={activeContact.online} />
          <Text style={styles.detailTitle}>{activeContact.name}</Text>
          <Text style={styles.detailMeta}>{activeCall.video ? '📹 Video call in progress' : '📞 Audio call in progress'}</Text>
          <View style={styles.detailActions}>
            <Pressable style={[styles.detailAction, { backgroundColor: colors.danger }]} onPress={endActiveCall}>
              <Ionicons name="call" size={22} color={colors.white} />
              <Text style={[styles.detailActionText, { color: colors.white }]}>End call</Text>
            </Pressable>
          </View>
        </View>
      ) : selected ? (
        <View style={styles.contactDetail}>
          <Avatar name={selected.name} color={selected.avatarColor} size={90} online={selected.online} />
          <Text style={styles.detailTitle}>{selected.name}</Text>
          <Text style={styles.detailMeta}>{selected.macroId}</Text>
          <View style={styles.detailActions}>
            <Pressable style={styles.detailAction} onPress={() => placeCall(selected, false)}>
              <Ionicons name="call" size={22} color={colors.navy950} />
              <Text style={styles.detailActionText}>Audio call</Text>
            </Pressable>
            <Pressable style={styles.detailAction} onPress={() => placeCall(selected, true)}>
              <Ionicons name="videocam" size={23} color={colors.navy950} />
              <Text style={styles.detailActionText}>Video call</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <EmptyDetail icon="call-outline" title="Private calls" text="Choose a contact to start an encrypted call." />
      )}
    </Workspace>
  );
}

export function WebPeople() {
  const { chats, profile } = useApp();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const contacts = useMemo(() => chats.filter((chat) => !chat.isGroup && `${chat.name} ${chat.macroId}`.toLowerCase().includes(query.toLowerCase())), [chats, query]);
  const selected = contacts.find((chat) => chat.id === selectedId) ?? contacts[0];

  return (
    <Workspace
      active="people" title="People" subtitle="Private connections by Macro ID."
      action={<Pressable accessibilityLabel="Add contact" style={styles.primaryIcon} onPress={() => router.push('/new-chat')}><Ionicons name="person-add" size={20} color={colors.navy950} /></Pressable>}
      sidebar={<><Search value={query} onChangeText={setQuery} placeholder="Search people or Macro ID" /><View style={styles.peopleActions}><Pressable style={styles.quickAction} onPress={() => router.push('/new-chat')}><Ionicons name="person-add-outline" size={19} color={colors.blue} /><Text style={styles.quickText}>New contact</Text></Pressable><Pressable style={styles.quickAction} onPress={() => router.push('/scan-macro')}><Ionicons name="scan-outline" size={19} color={colors.blue} /><Text style={styles.quickText}>Scan QR</Text></Pressable></View><Text style={styles.sectionLabel}>{contacts.length} CONNECTIONS</Text><FlatList data={contacts} keyExtractor={(item) => item.id} ListEmptyComponent={<Text style={styles.emptyList}>No matching contacts.</Text>} renderItem={({ item }) => <Pressable style={[styles.listRow, selected?.id === item.id && styles.listRowActive]} onPress={() => setSelectedId(item.id)}><Avatar name={item.name} color={item.avatarColor} size={45} online={item.online} /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.rowMeta}>{item.macroId}</Text></View></Pressable>} /></>}
    >
      {selected ? <View style={styles.contactDetail}><Avatar name={selected.name} color={selected.avatarColor} size={96} online={selected.online} /><Text style={styles.detailTitle}>{selected.name}</Text><Text style={styles.detailMeta}>{selected.macroId}</Text><Text style={styles.lastSeen}>{selected.online ? 'Online now' : selected.lastSeen}</Text><View style={styles.detailActions}><Pressable style={styles.detailAction} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: selected.id } })}><Ionicons name="chatbubble" size={21} color={colors.navy950} /><Text style={styles.detailActionText}>Message</Text></Pressable><Pressable style={styles.secondaryAction} onPress={async () => { await Clipboard.setStringAsync(selected.macroId); Alert.alert('Copied', selected.macroId); }}><Ionicons name="copy-outline" size={20} color={colors.blue} /><Text style={styles.secondaryActionText}>Copy ID</Text></Pressable></View></View> : <View style={styles.contactDetail}><QRCode value={`macrochat://add?macroId=${encodeURIComponent(profile?.macroId || '')}`} size={150} color={colors.navy950} backgroundColor={colors.white} /><Text style={styles.detailTitle}>Share your Macro ID</Text><Text style={styles.detailMeta}>{profile?.macroId}</Text></View>}
    </Workspace>
  );
}

export function WebNewChat({ macroId, onChangeMacroId, onStart, starting }: { macroId: string; onChangeMacroId: (value: string) => void; onStart: () => void; starting: boolean }) {
  return (
    <View style={styles.desktop}>
      <WebRail active="chats" />
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <View><Text style={styles.brand}>MACROCHAT</Text><Text style={styles.sidebarTitle}>New conversation</Text></View>
          <Pressable accessibilityLabel="Close new conversation" style={styles.closeButton} onPress={() => router.replace('/(tabs)')}><Ionicons name="close" size={21} color={colors.muted} /></Pressable>
        </View>
        <Text style={styles.sidebarSubtitle}>Connect privately without sharing phone numbers or email addresses.</Text>
        <View style={styles.newChatMethods}>
          <View style={[styles.methodRow, styles.methodActive]}>
            <View style={styles.methodIcon}><Ionicons name="at-outline" size={20} color={colors.neon} /></View>
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>Use Macro ID</Text><Text style={styles.rowMeta}>Enter a trusted contact&apos;s public ID</Text></View>
            <Ionicons name="checkmark-circle" size={19} color={colors.neon} />
          </View>
          <Pressable style={styles.methodRow} onPress={() => router.push('/scan-macro')}>
            <View style={styles.methodIcon}><Ionicons name="scan-outline" size={20} color={colors.blue} /></View>
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>Scan QR code</Text><Text style={styles.rowMeta}>Connect using their Macro QR</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>
        <View style={styles.privacyNote}><Ionicons name="shield-checkmark-outline" size={19} color={colors.blue} /><Text style={styles.privacyText}>Macro IDs keep personal contact details private.</Text></View>
      </View>

      <View style={styles.newChatDetail}>
        <View style={styles.newChatForm}>
          <View style={styles.newChatMark}><Ionicons name="person-add-outline" size={30} color={colors.neon} /></View>
          <Text style={styles.formEyebrow}>PRIVATE CONNECTION</Text>
          <Text style={styles.formTitle}>Start a conversation</Text>
          <Text style={styles.formText}>Enter the exact Macro ID shared by your contact. They will never need to reveal their phone number or email.</Text>
          <Text style={styles.formLabel}>MACRO ID</Text>
          <View style={styles.macroInputShell}>
            <Ionicons name="at-outline" size={20} color={colors.blue} />
            <TextInput
              value={macroId}
              onChangeText={onChangeMacroId}
              placeholder="MC-NOVA-1234"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={onStart}
              style={[styles.macroInput, { outlineStyle: 'none' } as never]}
            />
          </View>
          <Pressable style={[styles.startConversation, starting && styles.disabled]} onPress={onStart} disabled={starting}>
            <Text style={styles.startConversationText}>{starting ? 'Connecting privately...' : 'Start conversation'}</Text>
            <Ionicons name={starting ? 'hourglass-outline' : 'arrow-forward'} size={19} color={colors.navy950} />
          </Pressable>
          <Pressable style={styles.scanAlternative} onPress={() => router.push('/scan-macro')}>
            <Ionicons name="qr-code-outline" size={19} color={colors.blue} />
            <Text style={styles.scanAlternativeText}>Scan a Macro QR instead</Text>
          </Pressable>
          <View style={styles.formSecurity}><Ionicons name="lock-closed" size={12} color={colors.neon} /><Text style={styles.formSecurityText}>The connection request is protected by your authenticated session.</Text></View>
        </View>
      </View>
    </View>
  );
}

export function WebSettingsShell({ activeId, title, subtitle, children }: { activeId: string; title: string; subtitle: string; children: React.ReactNode }) {
  const { profile, backendMode } = useApp();
  const [query, setQuery] = useState('');
  if (!profile) return null;
  const filtered = settingsItems.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Workspace
      active="settings"
      title="Settings"
      subtitle={`${profile.displayName} · ${backendMode === 'supabase' ? 'Online' : 'Offline'}`}
      sidebar={(
        <>
          <Search value={query} onChangeText={setQuery} placeholder="Search settings" />
          <Pressable style={styles.settingsProfile} onPress={() => router.replace('/settings')}>
            <Avatar name={profile.displayName} color={profile.avatarColor} size={52} online />
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>{profile.displayName}</Text><Text style={styles.rowMeta}>{profile.macroId}</Text></View>
          </Pressable>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={[styles.settingRow, activeId === item.id && styles.listRowActive]} onPress={() => router.push(item.route ?? '/settings')}>
                <View style={styles.settingIcon}><Ionicons name={item.icon} size={20} color={activeId === item.id ? colors.neon : colors.blue} /></View>
                <View style={styles.rowCopy}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{item.detail}</Text></View>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </Pressable>
            )}
          />
        </>
      )}
    >
      <View style={styles.subpageHeader}>
        <Pressable accessibilityLabel="Back to settings" style={styles.subpageBack} onPress={() => router.replace('/settings')}><Ionicons name="chevron-back" size={21} color={colors.white} /></Pressable>
        <View><Text style={styles.subpageTitle}>{title}</Text><Text style={styles.subpageSubtitle}>{subtitle}</Text></View>
      </View>
      <View style={styles.subpageContent}>{children}</View>
    </Workspace>
  );
}

export function WebSettings() {
  const { profile, backendMode, signOut, updateProfilePicture } = useApp();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('account');
  if (!profile) return null;
  const filtered = settingsItems.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase()));
  const selected = settingsItems.find((item) => item.id === selectedId) ?? settingsItems[0];

  const pickProfilePicture = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.8,
      mediaTypes: ['images'],
    });

    if (!result.canceled && result.assets[0]) {
      await updateProfilePicture(result.assets[0].uri);
      Alert.alert('Profile picture updated');
    }
  };

  const reset = async () => {
    const message = 'Sign out of MacroChat on this browser? If no recovery method is connected, you may permanently lose access to this identity.';
    if (!globalThis.confirm(message)) return;
    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert('Sign out failed', error instanceof Error ? error.message : 'Try again.');
    }
  };

  return (
    <Workspace
      active="settings" title="Settings" subtitle={`${profile.displayName} · ${backendMode === 'supabase' ? 'Online' : 'Offline'}`}
      sidebar={<><Search value={query} onChangeText={setQuery} placeholder="Search settings" /><View style={styles.settingsProfile}><Avatar name={profile.displayName} color={profile.avatarColor} size={52} online /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{profile.displayName}</Text><Text style={styles.rowMeta}>{profile.macroId}</Text></View></View><FlatList data={filtered} keyExtractor={(item) => item.id} renderItem={({ item }) => <Pressable style={[styles.settingRow, selected.id === item.id && styles.listRowActive]} onPress={() => { setSelectedId(item.id); if (item.route) router.push(item.route); }}><View style={styles.settingIcon}><Ionicons name={item.icon} size={20} color={colors.blue} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.rowMeta}>{item.detail}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable>} /></>}
    >
      <ScrollView contentContainerStyle={styles.settingsDetail}>
        <View style={styles.settingsHeading}><View style={styles.largeSettingIcon}><Ionicons name={selected.icon} size={30} color={colors.blue} /></View><View><Text style={styles.detailTitle}>{selected.title}</Text><Text style={styles.detailMeta}>{selected.detail}</Text></View></View>
        <View style={styles.accountPanel}><Avatar name={profile.displayName} color={profile.avatarColor} size={72} online imageUrl={profile.avatarUrl} /><View style={styles.accountCopy}><Text style={styles.accountName}>{profile.displayName}</Text><Pressable onPress={async () => { await Clipboard.setStringAsync(profile.macroId); Alert.alert('Copied', profile.macroId); }}><Text style={styles.accountId}>{profile.macroId}  <Ionicons name="copy-outline" size={13} /></Text></Pressable><Text style={styles.onlineLabel}>{backendMode === 'supabase' ? '● Online mode' : '● Offline mode'}</Text></View><View style={styles.qr}><QRCode value={`macrochat://add?macroId=${encodeURIComponent(profile.macroId)}`} size={112} color={colors.navy950} backgroundColor={colors.white} /></View></View>

        <View style={styles.avatarPickerPanel}>
          <Text style={styles.avatarPickerTitle}>Profile photo</Text>
          <View style={styles.defaultAvatarGrid}>
            {Array.from(new Set([...(profile.avatarUrl ? [profile.avatarUrl] : []), ...DEFAULT_PROFILE_AVATARS])).slice(0, 8).map((url) => (
              <Pressable key={url} onPress={async () => { await updateProfilePicture(url); }} style={[styles.avatarChoice, profile.avatarUrl === url && styles.avatarChoiceActive]}>
                <Avatar name={profile.displayName} color={profile.avatarColor} size={42} imageUrl={url} />
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.uploadButton} onPress={pickProfilePicture}>
            <Ionicons name="cloud-upload-outline" size={16} color={colors.white} />
            <Text style={styles.uploadButtonText}>Upload custom photo</Text>
          </Pressable>
        </View>

        <Pressable style={styles.openSetting} onPress={() => selected.route && router.push(selected.route)} disabled={!selected.route}><Text style={styles.openSettingText}>{selected.route ? `Open ${selected.title}` : 'Configuration coming soon'}</Text><Ionicons name="arrow-forward" size={18} color={selected.route ? colors.navy950 : colors.muted} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out or reset identity" style={styles.reset} onPress={reset}><Ionicons name="log-out-outline" size={19} color={colors.danger} /><Text style={styles.resetText}>Sign out or reset identity</Text></Pressable>
      </ScrollView>
    </Workspace>
  );
}

const styles = StyleSheet.create({
  desktop: { flex: 1, minWidth: 820, flexDirection: 'row', backgroundColor: colors.navy950 },
  rail: { width: 68, backgroundColor: colors.black, borderRightWidth: 1, borderRightColor: colors.border, alignItems: 'center', paddingVertical: 14 },
  logo: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.navy950, fontSize: 20, fontWeight: '900' },
  railNav: { flex: 1, paddingTop: 28, gap: 8 },
  railButton: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  railActive: { backgroundColor: colors.navy800, borderLeftWidth: 2, borderLeftColor: colors.neon },
  profileAvatar: { marginTop: 10 },
  sidebar: { width: 390, maxWidth: '34%', backgroundColor: colors.navy900, borderRightWidth: 1, borderRightColor: colors.border },
  sidebarHeader: { height: 82, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.blue, fontSize: 9, fontWeight: '900' },
  sidebarTitle: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 2 },
  sidebarSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, paddingHorizontal: 18, marginTop: -9, marginBottom: 12 },
  primaryIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  connectionDot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  search: { height: 42, marginHorizontal: 12, backgroundColor: colors.navy800, borderRadius: 7, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, color: colors.white, fontSize: 13 },
  detail: { flex: 1, minWidth: 0, backgroundColor: colors.navy950 },
  sectionLabel: { color: colors.blue, fontSize: 10, fontWeight: '900', marginHorizontal: 14, marginTop: 16, marginBottom: 7 },
  listRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14 },
  listRowActive: { backgroundColor: colors.navy800, borderLeftWidth: 3, borderLeftColor: colors.neon, paddingLeft: 11 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  rowMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  missedCall: { color: colors.danger },
  rowAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emptyList: { color: colors.muted, textAlign: 'center', margin: 25, fontSize: 12 },
  myUpdate: { margin: 12, marginBottom: 0, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  addUpdate: { width: 45, height: 45, borderRadius: 23, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  updateRing: { padding: 2, borderWidth: 2, borderColor: colors.neon, borderRadius: 27 },
  updateRingViewed: { borderColor: colors.muted },
  emptyDetail: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 5, borderBottomColor: colors.neon },
  emptyIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 18 },
  emptyText: { color: colors.muted, fontSize: 13, marginTop: 7 },
  updateViewer: { flex: 1, backgroundColor: colors.black, padding: 20 },
  viewerTop: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  updateCanvas: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy900, borderRadius: 8 },
  updateImage: { width: '100%', height: '100%', borderRadius: 8 },
  updateMessage: { color: colors.white, fontSize: 20, fontWeight: '800', marginTop: 20 },
  replyBox: { height: 52, marginTop: 12, borderRadius: 8, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  replyHint: { flex: 1, color: colors.muted },
  // WEB STATUS FULLSCREEN VIEWER STYLES
  webStatusOverlay: { flex: 1, backgroundColor: '#0B141A', flexDirection: 'column', position: 'relative' },
  statusSegmentRow: { flexDirection: 'row', height: 4, paddingHorizontal: 20, paddingTop: 12, gap: 4 },
  statusSegment: { flex: 1, height: 3, borderRadius: 2 },
  webStatusHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  webStatusBackButton: { padding: 6, marginRight: 10 },
  webStatusName: { color: colors.white, fontSize: 16, fontWeight: '900' },
  webStatusTime: { color: colors.muted, fontSize: 12, marginTop: 2 },
  webStatusDeleteButton: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,107,107,0.15)' },
  webStatusCanvas: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, position: 'relative' },
  webNavLeft: { position: 'absolute', left: 20, zIndex: 10, padding: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  webNavRight: { position: 'absolute', right: 20, zIndex: 10, padding: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  webStatusMediaContainer: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  webStatusImage: { width: '100%', height: '100%', maxHeight: 650 },
  webStatusVideoPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  webStatusMessage: { color: colors.white, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  webStatusFooter: { height: 70, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  webStatusViewsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  webStatusViewsText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  webStatusReplyBox: { width: '100%', maxWidth: 500, height: 44, borderRadius: 8, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  webStatusReplyInput: { flex: 1, color: colors.white, fontSize: 14 },
  contactDetail: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  detailTitle: { color: colors.white, fontSize: 25, fontWeight: '900', marginTop: 16 },
  detailMeta: { color: colors.muted, fontSize: 13, marginTop: 5 },
  lastSeen: { color: colors.neon, fontSize: 11, marginTop: 8 },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 28 },
  detailAction: { minWidth: 130, height: 48, borderRadius: 8, backgroundColor: colors.neon, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  detailActionText: { color: colors.navy950, fontWeight: '900' },
  secondaryAction: { minWidth: 120, height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryActionText: { color: colors.blue, fontWeight: '800' },
  callStage: { flex: 1, backgroundColor: colors.navy900, position: 'relative', overflow: 'hidden' },
  callOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'column', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 20, pointerEvents: 'box-none', zIndex: 30 },
  callHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 12 },
  callInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  callName: { color: colors.white, fontSize: 18, fontWeight: '900' },
  callStatus: { color: colors.muted, fontSize: 12, marginTop: 2 },
  closeCallButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,0,0,0.5)', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' },
  callControlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, pointerEvents: 'auto' },
  callButton: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' },
  acceptButton: { backgroundColor: colors.neon },
  endButton: { backgroundColor: colors.danger },
  muteButton: { backgroundColor: colors.blue },
  videoToggleButton: { backgroundColor: colors.blue },
  peopleActions: { flexDirection: 'row', gap: 8, margin: 12 },
  quickAction: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  quickText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  closeButton: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  newChatMethods: { paddingHorizontal: 12, gap: 7 },
  methodRow: { minHeight: 68, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  methodActive: { backgroundColor: colors.navy800, borderColor: colors.blue },
  methodIcon: { width: 38, height: 38, borderRadius: 7, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  privacyNote: { margin: 16, marginTop: 22, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  privacyText: { color: colors.muted, fontSize: 11, lineHeight: 17, flex: 1 },
  newChatDetail: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', padding: 36, backgroundColor: colors.navy950, borderBottomWidth: 5, borderBottomColor: colors.neon },
  newChatForm: { width: '100%', maxWidth: 540 },
  newChatMark: { width: 60, height: 60, borderRadius: 8, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  formEyebrow: { color: colors.blue, fontSize: 10, fontWeight: '900' },
  formTitle: { color: colors.white, fontSize: 30, fontWeight: '900', marginTop: 6 },
  formText: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 10, marginBottom: 28, maxWidth: 500 },
  formLabel: { color: colors.blue, fontWeight: '900', fontSize: 10, marginBottom: 8 },
  macroInputShell: { height: 56, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15 },
  macroInput: { flex: 1, color: colors.white, fontSize: 17, fontWeight: '800' },
  startConversation: { height: 52, borderRadius: 8, backgroundColor: colors.neon, marginTop: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  startConversationText: { color: colors.navy950, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  scanAlternative: { height: 48, marginTop: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  scanAlternativeText: { color: colors.blue, fontSize: 13, fontWeight: '800' },
  formSecurity: { marginTop: 22, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15, flexDirection: 'row', alignItems: 'center', gap: 7 },
  formSecurityText: { color: colors.muted, fontSize: 11 },
  subpageHeader: { height: 82, paddingHorizontal: 26, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.navy900, flexDirection: 'row', alignItems: 'center', gap: 12 },
  subpageBack: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  subpageTitle: { color: colors.white, fontSize: 20, fontWeight: '900' },
  subpageSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  subpageContent: { flex: 1, minHeight: 0 },
  settingsProfile: { margin: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  settingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  settingIcon: { width: 36, height: 36, borderRadius: 7, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  settingsDetail: { padding: 34, maxWidth: 900, width: '100%', alignSelf: 'center' },
  settingsHeading: { flexDirection: 'row', alignItems: 'center', gap: 15, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 22 },
  largeSettingIcon: { width: 58, height: 58, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  accountPanel: { marginTop: 28, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.navy900, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16 },
  accountCopy: { flex: 1 },
  accountName: { color: colors.white, fontSize: 20, fontWeight: '900' },
  accountId: { color: colors.blue, fontSize: 12, fontWeight: '800', marginTop: 6 },
  onlineLabel: { color: colors.neon, fontSize: 10, marginTop: 7 },
  qr: { backgroundColor: colors.white, padding: 7, borderRadius: 6 },
  openSetting: { marginTop: 18, height: 50, borderRadius: 8, backgroundColor: colors.neon, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  openSettingText: { color: colors.navy950, fontWeight: '900' },
  avatarPickerPanel: { marginTop: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.navy900, padding: 14 },
  avatarPickerTitle: { color: colors.white, fontSize: 13, fontWeight: '800', marginBottom: 10 },
  defaultAvatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatarChoice: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  avatarChoiceActive: { borderColor: colors.neon, shadowColor: colors.neon, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  uploadButton: { marginTop: 12, height: 38, borderRadius: 8, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadButtonText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  reset: { marginTop: 14, height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#5C2940', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resetText: { color: colors.danger, fontWeight: '800' },
  // FULLSCREEN CALL STYLES
  fullscreenCall: { flex: 1, backgroundColor: colors.navy900, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  callVideoContainer: { flex: 1, backgroundColor: '#000', position: 'relative', width: '100%', height: '100%' },
  callUIOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'column', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 20, pointerEvents: 'box-none', zIndex: 40 },
  callHeaderFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  callInfoFull: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  callNameFull: { color: colors.white, fontSize: 20, fontWeight: '900' },
  callStatusFull: { color: colors.muted, fontSize: 12, marginTop: 4 },
  modeToggleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(85,185,255,0.2)', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', marginLeft: 10 },
  callControlsBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 20, paddingVertical: 22, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, pointerEvents: 'auto' },
  acceptButtonLarge: { backgroundColor: colors.neon },
  muteButtonLarge: { backgroundColor: 'rgba(85,185,255,0.4)' },
  videoButtonLarge: { backgroundColor: 'rgba(85,185,255,0.4)' },
  speakerButtonLarge: { backgroundColor: 'rgba(85,185,255,0.4)' },
  endButtonLarge: { backgroundColor: colors.danger },
  // FLOATING CALL STYLES
  floatingCallContainer: { position: 'absolute', bottom: 20, right: 20, zIndex: 99, width: 360, height: 540, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.navy900, borderWidth: 1, borderColor: colors.border, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' } as any,
  floatingCallWindow: { flex: 1, flexDirection: 'column', backgroundColor: colors.navy900 },
  floatingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.navy800 },
  floatingInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  floatingName: { color: colors.white, fontSize: 15, fontWeight: '900' },
  floatingStatus: { color: colors.muted, fontSize: 11, marginTop: 2 },
  floatingActions: { flexDirection: 'row', alignItems: 'center', gap: 8, pointerEvents: 'auto' },
  floatingButton: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(85,185,255,0.3)', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' },
  floatingVideoArea: { flex: 1, backgroundColor: '#000', position: 'relative', overflow: 'hidden' },
  floatingControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 12, backgroundColor: colors.navy800, borderTopWidth: 1, borderTopColor: colors.border, pointerEvents: 'auto' },
  floatingControlButton: { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' },
});