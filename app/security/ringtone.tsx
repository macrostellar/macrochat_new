import { useCallback, useRef, useState } from 'react';
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { CUSTOM_RINGTONE_PREFIX, MESSAGE_TONES, CALL_RINGTONES, getRingtoneLabel, previewRingtone, stopPreview } from '@/lib/ringtones';

export default function RingtoneScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const { notificationPrefs, updateNotificationPrefs } = useApp();
  const isWide = Platform.OS === 'web' && width >= 820;

  const isCall = target === 'call';
  const prefKey = isCall ? 'callRingtone' : 'messageRingtone';
  const selected = notificationPrefs[prefKey];
  const availableTones = isCall ? CALL_RINGTONES : MESSAGE_TONES;
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const selection = useRef(0);

  useFocusEffect(useCallback(() => {
    if (target !== 'message' && target !== 'call') return;
    focused.current = true;
    const stop = () => { selection.current++; setPlaying(null); void stopPreview(); };
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') stop(); });
    const visibility = () => { if (document.hidden) stop(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', visibility);
    return () => {
      focused.current = false;
      listener.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', visibility);
      stop();
    };
  }, [target]));

  const select = async (value: string) => {
    if (!focused.current) return;
    const request = ++selection.current;
    setPlaying(value);
    setError(null);
    const playback = previewRingtone(value, () => { if (selection.current === request) setPlaying(null); });
    try {
      await updateNotificationPrefs({ [prefKey]: value });
    } catch {
      if (focused.current && selection.current === request) {
        console.warn('[ringtone] local save succeeded; cloud sync failed');
      }
    }
    try { await playback; } catch {
      if (focused.current && selection.current === request) {
        setPlaying(null);
        setError('Could not play this sound. Check your connection and try again.');
      }
    }
  };

  const pickFromDevice = async () => {
    void stopPreview();
    setPlaying(null);
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await select(`${CUSTOM_RINGTONE_PREFIX}${result.assets[0].uri}`);
  };

  const isCustom = selected.startsWith(CUSTOM_RINGTONE_PREFIX);

  const content = (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, isWide && styles.webContent]}>
      {!isWide && (
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" style={styles.back} onPress={() => { void stopPreview(); router.back(); }}>
            <Ionicons name="chevron-back" size={23} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>{isCall ? 'Call ringtone' : 'Message tone'}</Text>
        </View>
      )}

      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={{ height: 44, alignItems: 'flex-end' }}>{playing && <Pressable accessibilityRole="button" accessibilityLabel="Stop preview" style={styles.back} onPress={() => { selection.current++; void stopPreview(); setPlaying(null); }}><Ionicons name="stop" size={20} color={colors.white} /></Pressable>}</View>

      <Text style={styles.section}>FROM YOUR DEVICE</Text>
      <Pressable style={styles.row} onPress={pickFromDevice}>
        <View style={styles.icon}>
          <Ionicons name="folder-open-outline" size={20} color={colors.blue} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.rowTitle}>Choose an audio file</Text>
          <Text style={styles.detail}>
            {isCustom ? getRingtoneLabel(selected) : 'Pick any track from your library'}
          </Text>
        </View>
        {isCustom && <Ionicons name="checkmark" size={22} color={colors.neon} />}
      </Pressable>

      <Text style={styles.section}>MACROCHAT TONES</Text>
      {availableTones.map((tone) => {
        const active = selected === tone.id;
        return (
          <Pressable key={tone.id} style={styles.row} onPress={() => select(tone.id)}>
            <View style={styles.icon}>
              <Ionicons
                name={playing === tone.id ? 'volume-high-outline' : 'musical-note-outline'}
                size={20}
                color={active ? colors.neon : colors.blue}
              />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.rowTitle, active && styles.rowTitleActive]}>{tone.label}</Text>
            </View>
            {active && <Ionicons name="checkmark" size={22} color={colors.neon} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (isWide) {
    return (
      <WebSettingsShell activeId="notifications" title={isCall ? 'Call ringtone' : 'Message tone'} subtitle="Pick the sound you hear">
        {content}
      </WebSettingsShell>
    );
  }
  return <Screen style={{ padding: 0 }}>{content}</Screen>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, width: '100%' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  webContent: { paddingHorizontal: 24, paddingTop: 8, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy900 },
  title: { color: colors.white, fontSize: 24, fontWeight: '800', flex: 1 },
  error: { color: colors.danger, fontSize: 13, marginVertical: 8 },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  section: { color: colors.blue, fontSize: 12, fontWeight: '700', letterSpacing: 0, marginTop: 22, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.navy800 },
  icon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy900 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: colors.white, fontSize: 15, fontWeight: '700' },
  rowTitleActive: { color: colors.neon },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 16 },
});
