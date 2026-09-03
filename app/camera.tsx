import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

type FilterPreset = {
  id: string;
  label: string;
  overlay: string;
};

const FILTERS: FilterPreset[] = [
  { id: 'none', label: 'None', overlay: 'transparent' },
  { id: 'cool', label: 'Cool', overlay: 'rgba(48,132,255,0.12)' },
  { id: 'warm', label: 'Warm', overlay: 'rgba(255,174,66,0.12)' },
  { id: 'neon', label: 'Neon', overlay: 'rgba(57,255,20,0.10)' },
  { id: 'mono', label: 'Mono', overlay: 'rgba(0,0,0,0.22)' },
];

export default function CameraScreen() {
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const { postUpdate } = useApp();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [recording, setRecording] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<'photo' | 'video'>('photo');
  const [posting, setPosting] = useState(false);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);

  const ensurePermissions = async () => {
    if (!cameraPermission?.granted) {
      const cameraResult = await requestCameraPermission();
      if (!cameraResult.granted) return false;
    }
    if (!micPermission?.granted) {
      const micResult = await requestMicPermission();
      if (!micResult.granted) return false;
    }
    return true;
  };

  const takePhoto = async () => {
    const allowed = await ensurePermissions();
    if (!allowed) return Alert.alert('Permission needed', 'Enable camera and microphone permissions first.');
    const result = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
    if (result?.uri) {
      setPreviewKind('photo');
      setPreviewUri(result.uri);
    }
  };

  const startOrStopRecording = async () => {
    if (!recording) {
      const allowed = await ensurePermissions();
      if (!allowed) return Alert.alert('Permission needed', 'Enable camera and microphone permissions first.');
      setRecording(true);
      const video = await cameraRef.current?.recordAsync({ maxDuration: 20 });
      setRecording(false);
      if (video?.uri) {
        setPreviewKind('video');
        setPreviewUri(video.uri);
      }
      return;
    }

    cameraRef.current?.stopRecording();
    setRecording(false);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPreviewUri(asset.uri);
      setPreviewKind(asset.type === 'video' ? 'video' : 'photo');
    }
  };

  const usePreview = async () => {
    console.log('[usePreview] Called with previewUri:', previewUri, 'intent:', intent);
    if (!previewUri) return;
    if (intent !== 'update') {
      console.log('[usePreview] Intent is not update, going back');
      router.back();
      return;
    }
    console.log('[usePreview] Posting update with kind:', previewKind);
    setPosting(true);
    try {
      console.log('[usePreview] Calling postUpdate');
      await postUpdate({ kind: previewKind, uri: previewUri });
      console.log('[usePreview] postUpdate successful, navigating to updates');
      router.push('/(tabs)/updates');
    } catch (error) {
      console.error('[usePreview] Error:', error);
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setPosting(false);
    }
  };

  if (!cameraPermission) return <View style={styles.page} />;

  return (
    <View style={styles.page}>
      {previewUri ? (
        <View style={styles.previewWrap}>
          {previewKind === 'video' ? (
            <View style={[styles.previewImage, styles.videoPlaceholder]}>
              <Ionicons name="videocam" size={48} color={colors.white} />
              <Text style={styles.videoPlaceholderText}>Video ready to post</Text>
            </View>
          ) : (
            <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="cover" />
          )}
          <View style={[styles.filterOverlay, { backgroundColor: activeFilter.overlay, pointerEvents: 'none' }]} />
          <Pressable style={styles.previewClose} onPress={() => setPreviewUri(null)}><Ionicons name="close" size={24} color={colors.white} /></Pressable>
          <View style={styles.previewActions}>
            <Pressable style={styles.previewBtn} onPress={() => setPreviewUri(null)} disabled={posting}><Text style={styles.previewBtnText}>Retake</Text></Pressable>
            <Pressable style={styles.previewBtn} onPress={usePreview} disabled={posting}>
              {posting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.previewBtnText}>{intent === 'update' ? 'Post update' : 'Use'}</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode="picture">
            <View style={[styles.filterOverlay, { backgroundColor: activeFilter.overlay, pointerEvents: 'none' }]} />
            <View style={styles.topBar}>
              <Pressable style={styles.topBtn} onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.white} /></Pressable>
              <Pressable style={styles.topBtn} onPress={() => setFacing((value) => value === 'back' ? 'front' : 'back')}><Ionicons name="camera-reverse-outline" size={24} color={colors.white} /></Pressable>
            </View>
          </CameraView>

          <View style={styles.controls}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {FILTERS.map((filter) => (
                <Pressable
                  key={filter.id}
                  style={[styles.filterChip, activeFilter.id === filter.id && styles.filterChipActive]}
                  onPress={() => setActiveFilter(filter)}
                >
                  <Text style={[styles.filterText, activeFilter.id === filter.id && styles.filterTextActive]}>{filter.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.bottomRow}>
              <Pressable style={styles.secondaryCapture} onPress={pickFromGallery}>
                <Ionicons name="image" size={22} color={colors.white} />
              </Pressable>
              <Pressable style={styles.secondaryCapture} onPress={startOrStopRecording}>
                <Ionicons name={recording ? 'stop' : 'videocam'} size={22} color={recording ? colors.danger : colors.white} />
              </Pressable>
              <Pressable style={styles.mainCapture} onPress={takePhoto}><View style={styles.mainCaptureInner} /></Pressable>
              <Pressable style={styles.secondaryCapture} onPress={() => setFacing((value) => value === 'back' ? 'front' : 'back')}>
                <Ionicons name="camera-reverse-outline" size={22} color={colors.white} />
              </Pressable>
              <Pressable style={styles.secondaryCapture} onPress={() => router.back()}>
                <Ionicons name="close" size={22} color={colors.white} />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.black },
  camera: { flex: 1 },
  topBar: { marginTop: 54, marginHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between' },
  topBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  filterOverlay: { ...StyleSheet.absoluteFillObject },
  controls: { paddingBottom: 26, paddingTop: 10, backgroundColor: colors.black },
  filters: { paddingHorizontal: 14, gap: 8, marginBottom: 14 },
  filterChip: { height: 34, borderRadius: 17, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', justifyContent: 'center' },
  filterChipActive: { borderColor: colors.neon, backgroundColor: 'rgba(57,255,20,0.15)' },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: colors.neon },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  secondaryCapture: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  mainCapture: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  mainCaptureInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white },
  previewWrap: { flex: 1 },
  previewImage: { flex: 1 },
  videoPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.navy800 },
  videoPlaceholderText: { color: colors.white, fontWeight: '700' },
  previewClose: { position: 'absolute', top: 54, right: 18, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  previewActions: { position: 'absolute', bottom: 36, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly' },
  previewBtn: { minWidth: 120, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.white, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  previewBtnText: { color: colors.white, fontWeight: '800' },
});
