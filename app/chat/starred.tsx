import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import type { Message } from '@/types';

export default function StarredMessagesScreen() {
  const { width } = useWindowDimensions();
  const { chats } = useApp();
  const [starredMessages, setStarredMessages] = useState<(Message & { chatId: string; chatName: string })[]>([]);

  useEffect(() => {
    const all: (Message & { chatId: string; chatName: string })[] = [];
    for (const chat of chats) {
      for (const msg of chat.messages) {
        if (msg.starred) {
          all.push({ ...msg, chatId: chat.id, chatName: chat.name });
        }
      }
    }
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setStarredMessages(all);
  }, [chats]);

  const isWeb = width >= 820;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.navy950 }]} edges={['top']}>
      <View style={[styles.header, isWeb && styles.headerDesktop]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.title}>Starred Messages</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.content}>
        {starredMessages.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="star-outline" size={56} color={colors.muted} />
            <Text style={styles.emptyText}>No starred messages yet</Text>
            <Text style={styles.emptySubtext}>Star messages to save them here</Text>
          </View>
        ) : (
          <FlatList
            data={starredMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                style={styles.messageCard}
                onPress={() => {
                  router.push({ pathname: '/chat/[id]', params: { id: item.chatId } });
                }}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.chatName}>{item.chatName}</Text>
                  <Text style={styles.time}>
                    {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
                <Text style={styles.messageText} numberOfLines={2}>
                  {item.text || item.fileName || `${item.kind} message`}
                </Text>
                {(item.mediaUrl || item.mediaPath) && (
                  <View style={styles.mediaPreview}>
                    {item.fileName?.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ? (
                      <Image source={{ uri: item.mediaUrl || item.mediaPath }} style={styles.mediaImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.mediaPlaceholder}>
                        <Ionicons name={item.kind === 'video' ? 'videocam-outline' : item.kind === 'voice' ? 'mic-outline' : 'document-outline'} size={20} color={colors.blue} />
                        <Text style={styles.mediaType}>{item.kind}</Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy950 },
  content: { flex: 1, width: '100%' },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 12, backgroundColor: colors.navy900, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerDesktop: { maxWidth: 980, width: '100%', alignSelf: 'center', paddingHorizontal: 14 },
  backBtn: { padding: 5 },
  title: { flex: 1, color: colors.white, fontSize: 18, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  emptySubtext: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  list: { paddingBottom: 20 },
  messageCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatName: { color: colors.neon, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  time: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  messageText: { color: colors.white, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  mediaPreview: { marginTop: 8, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.navy700, height: 140 },
  mediaImage: { width: '100%', height: '100%' },
  mediaPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  mediaType: { color: colors.muted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});
