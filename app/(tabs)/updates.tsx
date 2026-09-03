import { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { WebUpdates } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleString();
}

export default function UpdatesScreen() {
  const { width } = useWindowDimensions();
  const { updates, markUpdateViewed, deleteUpdate } = useApp();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [galleryMode, setGalleryMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeStart, setSwipeStart] = useState(0);

  const mine = useMemo(() => updates.filter((item) => item.mine), [updates]);
  const others = useMemo(() => updates.filter((item) => !item.mine), [updates]);
  const viewing = viewingId ? (galleryMode ? mine.find((m) => m.id === viewingId) : updates.find((item) => item.id === viewingId)) : null;

  // Debug logging
  console.log('[UpdatesScreen] Updates:', { total: updates.length, mine: mine.length, others: others.length });
  if (mine.length > 0) {
    console.log('[UpdatesScreen] Mine updates:', mine.map(m => ({ id: m.id, kind: m.kind, hasMediaUrl: !!m.mediaUrl, mediaUrlLength: m.mediaUrl?.length })));
  }

  if (Platform.OS === 'web' && width >= 820) return <WebUpdates />;

  const openMyStatusGallery = (id: string) => {
    const idx = mine.findIndex((m) => m.id === id);
    setCurrentIndex(idx >= 0 ? idx : 0);
    setViewingId(id);
    setGalleryMode(true);
    if (id) void markUpdateViewed(id);
  };

  const openContactUpdate = (id: string) => {
    setViewingId(id);
    setGalleryMode(false);
    void markUpdateViewed(id);
  };

  const navigateGallery = (direction: 'next' | 'prev') => {
    if (!viewing) return;
    let newIndex = currentIndex + (direction === 'next' ? 1 : -1);
    if (newIndex < 0 || newIndex >= mine.length) return;
    setCurrentIndex(newIndex);
    setViewingId(mine[newIndex].id);
    void markUpdateViewed(mine[newIndex].id);
  };

  const handleDelete = async () => {
    if (viewing && viewing.mine) {
      try {
        await deleteUpdate(viewing.id);
        if (currentIndex < mine.length - 1) {
          setCurrentIndex(currentIndex);
          setViewingId(mine[currentIndex + 1]?.id || null);
        } else if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
          setViewingId(mine[currentIndex - 1]?.id || null);
        } else {
          setViewingId(null);
          setGalleryMode(false);
        }
      } catch (error) {
        console.error('Failed to delete update:', error);
      }
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Updates</Text>
        <Pressable style={styles.icon} onPress={() => router.push('/camera?intent=update')}><Ionicons name="camera-outline" size={23} color={colors.white} /></Pressable>
      </View>
      <Text style={styles.caption}>Private moments disappear after 24 hours.</Text>

      {/* MY STATUS SECTION - WhatsApp Style */}
      <View style={styles.myStatusSection}>
        <Pressable 
          style={styles.myStatusCard} 
          onPress={() => mine.length > 0 && openMyStatusGallery(mine[0].id)}
        >
          {mine.length > 0 && mine[0].kind === 'photo' && mine[0].mediaUrl ? (
            <>
              <Image source={{ uri: mine[0].mediaUrl }} style={styles.myStatusImage} resizeMode="cover" />
              <View style={styles.myStatusOverlay} />
            </>
          ) : (
            <View style={styles.myStatusPlaceholder}>
              <Ionicons name="add-circle" size={40} color={colors.neon} />
            </View>
          )}
          <View style={styles.myStatusLabel}>
            <Text style={styles.myStatusText}>My Status</Text>
            {mine.length > 0 && <Text style={styles.myStatusMeta}>{mine.length} item{mine.length !== 1 ? 's' : ''}</Text>}
          </View>
        </Pressable>

        <Pressable 
          style={styles.addStatusButton} 
          onPress={() => router.push('/camera?intent=update')}
        >
          <Ionicons name="add-circle" size={40} color={colors.neon} />
          <Text style={styles.addStatusText}>Add</Text>
        </Pressable>
      </View>

      {/* CONTACTS UPDATES SECTION */}
      <Text style={styles.section}>FROM CONTACTS</Text>
      {others.length === 0 ? (
        <Text style={styles.empty}>No updates from contacts yet.</Text>
      ) : (
        <FlatList
          data={others}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openContactUpdate(item.id)}>
              <View style={[styles.ring, item.viewed && styles.ringViewed]}>
                <Avatar name={item.name} color={item.avatarColor} size={50} />
              </View>
              <View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* GALLERY MODAL - Full Screen for My Status */}
      <Modal visible={galleryMode && Boolean(viewing)} animationType="fade" transparent onRequestClose={() => { setViewingId(null); setGalleryMode(false); }}>
        <View style={styles.galleryBackdrop}>
          {viewing && (
            <>
              <View style={styles.galleryHeader}>
                <View style={styles.galleryInfo}>
                  <Avatar name={viewing.name} color={viewing.avatarColor} size={32} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={styles.galleryName}>{viewing.name}</Text>
                    <Text style={styles.galleryTime}>{timeAgo(viewing.createdAt)}</Text>
                  </View>
                </View>
                <View style={styles.galleryCounter}>
                  <Text style={styles.counterText}>{currentIndex + 1} / {mine.length}</Text>
                </View>
                <Pressable onPress={() => { setViewingId(null); setGalleryMode(false); }} style={styles.galleryCloseButton}>
                  <Ionicons name="close" size={28} color={colors.white} />
                </Pressable>
              </View>

              <View style={styles.galleryContent}>
                {viewing.kind === 'photo' && viewing.mediaUrl ? (
                  <Image source={{ uri: viewing.mediaUrl }} style={styles.galleryImage} resizeMode="contain" />
                ) : viewing.kind === 'video' ? (
                  <View style={styles.galleryPlaceholder}>
                    <Ionicons name="videocam" size={60} color={colors.neon} />
                    <Text style={styles.galleryText}>Video update</Text>
                  </View>
                ) : (
                  <View style={styles.galleryPlaceholder}>
                    <Text style={styles.galleryText}>{viewing.caption || 'Update'}</Text>
                  </View>
                )}
              </View>

              <View style={styles.galleryControls}>
                <Pressable 
                  style={[styles.galleryNavButton, currentIndex === 0 && styles.navButtonDisabled]} 
                  onPress={() => navigateGallery('prev')}
                  disabled={currentIndex === 0}
                >
                  <Ionicons name="chevron-back" size={32} color={currentIndex === 0 ? colors.muted : colors.neon} />
                </Pressable>

                <Pressable style={styles.galleryDeleteButton} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={24} color={colors.white} />
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>

                <Pressable 
                  style={[styles.galleryNavButton, currentIndex === mine.length - 1 && styles.navButtonDisabled]} 
                  onPress={() => navigateGallery('next')}
                  disabled={currentIndex === mine.length - 1}
                >
                  <Ionicons name="chevron-forward" size={32} color={currentIndex === mine.length - 1 ? colors.muted : colors.neon} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* REGULAR MODAL - For Contact Updates */}
      <Modal visible={Boolean(viewing) && !galleryMode} animationType="fade" transparent onRequestClose={() => setViewingId(null)}>
        <View style={styles.viewerBackdrop}>
          {viewing && (
            <View style={styles.viewerCard}>
              <View style={styles.viewerTop}>
                <Avatar name={viewing.name} color={viewing.avatarColor} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{viewing.name}</Text>
                  <Text style={styles.time}>{timeAgo(viewing.createdAt)}</Text>
                </View>
                <Pressable onPress={() => setViewingId(null)}><Ionicons name="close" size={26} color={colors.white} /></Pressable>
              </View>
              <View style={styles.viewerCanvas}>
                {viewing.kind === 'photo' && viewing.mediaUrl ? (
                  <Image source={{ uri: viewing.mediaUrl }} style={styles.viewerImage} resizeMode="contain" />
                ) : viewing.kind === 'video' ? (
                  <>
                    <Ionicons name="videocam" size={48} color={colors.white} />
                    <Text style={styles.viewerText}>Video update</Text>
                  </>
                ) : (
                  <Text style={styles.viewerText}>{viewing.caption || 'Update'}</Text>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.white, fontSize: 32, fontWeight: '900' },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  caption: { color: colors.muted, paddingHorizontal: 20, marginTop: -8 },
  myStatusContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  myStatusIcon: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mine: { margin: 20, padding: 16, borderRadius: 18, backgroundColor: colors.navy800, flexDirection: 'row', alignItems: 'center', gap: 14 },
  add: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.white, fontWeight: '800', fontSize: 15 },
  time: { color: colors.muted, fontSize: 12, marginTop: 4 },
  section: { color: colors.blue, fontWeight: '900', letterSpacing: 1.5, fontSize: 11, margin: 20, marginBottom: 7 },
  section2: { marginVertical: 20, paddingHorizontal: 20, paddingBottom: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: colors.white, fontWeight: '900', fontSize: 16 },
  uploadButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.navy800 },
  uploadButtonText: { color: colors.neon, fontWeight: '800', fontSize: 12 },
  myUpdatesContainer: { gap: 12, paddingRight: 8 },
  updateThumbnail: { width: 90, height: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.navy800, borderWidth: 2, borderColor: colors.navy700, position: 'relative' },
  updateThumbnailImage: { width: '100%', height: '100%' },
  updateThumbnailLabelOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, alignItems: 'center' },
  updateThumbnailPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy700, gap: 6 },
  updateTime: { color: colors.white, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  empty: { color: colors.muted, fontSize: 13, marginHorizontal: 20 },
  row: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14 },
  ring: { padding: 2, borderWidth: 2, borderColor: colors.neon, borderRadius: 30 },
  ringViewed: { borderColor: colors.border },
  myThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  myThumbImage: { width: '100%', height: '100%' },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  viewerCard: { backgroundColor: colors.navy900, borderRadius: 18, padding: 16, maxHeight: '80%' },
  viewerTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  viewerCanvas: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.navy800, borderRadius: 12 },
  viewerImage: { width: '100%', height: 320, borderRadius: 12 },
  viewerText: { color: colors.white, fontWeight: '700', paddingHorizontal: 16, textAlign: 'center' },

  // WhatsApp-style Status UI
  myStatusSection: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  myStatusCard: { flex: 1, height: 120, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.navy800, borderWidth: 2, borderColor: colors.navy700, position: 'relative' },
  myStatusImage: { width: '100%', height: '100%' },
  myStatusOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  myStatusPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy700 },
  myStatusLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 10 },
  myStatusText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  myStatusMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  addStatusButton: { width: 120, height: 120, borderRadius: 14, backgroundColor: colors.navy800, borderWidth: 2, borderColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  addStatusText: { color: colors.white, fontWeight: '800', fontSize: 12, marginTop: 6 },

  // Full-screen Gallery
  galleryBackdrop: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between', paddingVertical: 16 },
  galleryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  galleryInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  galleryName: { color: colors.white, fontWeight: '800', fontSize: 15 },
  galleryTime: { color: colors.muted, fontSize: 12 },
  galleryCounter: { position: 'absolute', alignSelf: 'center' },
  counterText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  galleryCloseButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  galleryContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  galleryImage: { width: '100%', height: '100%', maxHeight: 600 },
  galleryPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  galleryText: { color: colors.white, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  galleryControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 16 },
  galleryNavButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  navButtonDisabled: { opacity: 0.3 },
  galleryDeleteButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.danger },
  deleteButtonText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});

