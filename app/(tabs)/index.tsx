import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { WebMessenger } from '@/components/WebMessenger';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ChatsScreen() {
  const { width } = useWindowDimensions();
  const { chats, profile, mfaAal2, e2eeEnabled } = useApp();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => chats.filter((chat) => `${chat.name} ${chat.macroId}`.toLowerCase().includes(query.toLowerCase())), [chats, query]);

  if (Platform.OS === 'web' && width >= 820) return <WebMessenger />;

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <View>
          <Text style={styles.eyebrow}>PRIVATE MESSAGING</Text>
          <Text style={styles.title}>Chats</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Open camera" style={styles.iconButton} onPress={() => router.push('/camera')}><Ionicons name="camera-outline" size={21} color={colors.white} /></Pressable>
          <Pressable accessibilityLabel="Start a new chat" style={[styles.iconButton, styles.newButton]} onPress={() => router.push('/new-chat')}><Ionicons name="add" size={22} color={colors.black} /></Pressable>
        </View>
      </View>
      <View style={styles.identityCard}><View style={styles.liveDot} /><Text style={styles.identityText}>Your ID: {profile?.macroId}</Text><Ionicons name="copy-outline" color={colors.blue} size={15} /></View>
      <View style={styles.securityRow}>
        <Pressable style={[styles.securityChip, mfaAal2 ? styles.securityChipOn : styles.securityChipOff]} onPress={() => router.push('/security/mfa')}>
          <Ionicons name={mfaAal2 ? 'shield-checkmark' : 'shield-outline'} size={12} color={mfaAal2 ? colors.neon : colors.muted} />
          <Text style={[styles.securityChipText, mfaAal2 ? styles.securityChipTextOn : styles.securityChipTextOff]}>AAL2 {mfaAal2 ? 'ON' : 'OFF'}</Text>
        </Pressable>
        <Pressable style={[styles.securityChip, e2eeEnabled ? styles.securityChipOn : styles.securityChipOff]} onPress={() => router.push('/security/e2ee')}>
          <Ionicons name={e2eeEnabled ? 'lock-closed' : 'lock-open-outline'} size={12} color={e2eeEnabled ? colors.neon : colors.muted} />
          <Text style={[styles.securityChipText, e2eeEnabled ? styles.securityChipTextOn : styles.securityChipTextOff]}>E2EE {e2eeEnabled ? 'ON' : 'OFF'}</Text>
        </Pressable>
      </View>
      <View style={styles.search}><Ionicons name="search" size={20} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Search chats or Macro IDs" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
      <View style={styles.filterRow}>
        {['All', 'Unread', 'Groups'].map((label, index) => <View key={label} style={[styles.filter, index === 0 && styles.filterActive]}><Text style={[styles.filterText, index === 0 && styles.filterTextActive]}>{label}</Text></View>)}
      </View>
      <FlatList
        data={filtered} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: 28 }}
        ListEmptyComponent={<Text style={styles.empty}>No conversations found.</Text>}
        renderItem={({ item }) => {
          const last = item.messages[item.messages.length - 1];
          return (
            <Pressable style={({ pressed }) => [styles.chat, pressed && { backgroundColor: colors.navy800 }]} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}>
              <Avatar name={item.name} color={item.avatarColor} online={item.online} />
              <View style={styles.chatBody}>
                <View style={styles.chatTop}><Text style={styles.chatName} numberOfLines={1}>{item.name}</Text><Text style={[styles.time, item.unread > 0 && { color: colors.neon }]}>{last ? timeLabel(last.createdAt) : 'New'}</Text></View>
                <View style={styles.chatBottom}><Text style={styles.preview} numberOfLines={1}>{last?.senderId === 'me' ? 'You: ' : ''}{last?.text ?? 'Start a private conversation'}</Text>{item.unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View>}</View>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  eyebrow: { color: colors.blue, fontWeight: '800', letterSpacing: 1.4, fontSize: 11 },
  title: { color: colors.white, fontSize: 34, fontWeight: '900', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  newButton: { backgroundColor: colors.neon, borderColor: colors.neon },
  identityCard: { marginHorizontal: 20, marginTop: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 14, paddingHorizontal: 12, height: 40, flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.neon },
  identityText: { color: colors.muted, fontSize: 12, flex: 1 },
  securityRow: { marginHorizontal: 20, marginBottom: 10, flexDirection: 'row', gap: 8 },
  securityChip: { height: 28, borderRadius: 14, paddingHorizontal: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  securityChipOn: { backgroundColor: colors.navy800, borderColor: colors.neon },
  securityChipOff: { backgroundColor: colors.navy800, borderColor: colors.border },
  securityChipText: { fontSize: 11, fontWeight: '800' },
  securityChipTextOn: { color: colors.neon },
  securityChipTextOff: { color: colors.muted },
  search: { marginHorizontal: 20, marginTop: 6, marginBottom: 12, height: 48, borderRadius: 15, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 }, searchInput: { color: colors.white, flex: 1, fontSize: 15 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 9, marginBottom: 10 }, filter: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 15 }, filterActive: { backgroundColor: '#173852', borderColor: colors.blue }, filterText: { color: colors.muted, fontWeight: '700', fontSize: 12 }, filterTextActive: { color: colors.blue },
  chat: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 13, gap: 13 }, chatBody: { flex: 1, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 13 }, chatTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, chatName: { color: colors.white, fontSize: 16, fontWeight: '800', flex: 1 }, time: { color: colors.muted, fontSize: 11 }, chatBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 5 }, preview: { color: colors.muted, fontSize: 14, flex: 1 }, badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: colors.navy950, fontSize: 11, fontWeight: '900' }, empty: { color: colors.muted, textAlign: 'center', marginTop: 60 },
});
