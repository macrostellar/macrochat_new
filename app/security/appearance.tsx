import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import type { TextSizePreset, ChatWallpaperPreset, ChatFontFamily } from '@/types';

const TEXT_SIZES: { preset: TextSizePreset; label: string; detail: string; sample: number }[] = [
  { preset: 'compact', label: 'Compact', detail: 'Tight spacing, more messages on screen', sample: 14 },
  { preset: 'comfortable', label: 'Comfortable', detail: 'Balanced default', sample: 15 },
  { preset: 'large', label: 'Large', detail: 'Easier reading', sample: 16 },
  { preset: 'xl', label: 'Extra large', detail: 'Maximum readability', sample: 17 },
];

const WALLPAPERS: { preset: ChatWallpaperPreset; label: string; detail: string; page: string; bubble: string; bubbleMine: string }[] = [
  { preset: 'midnight', label: 'Midnight', detail: 'Deep ocean blue', page: '#030B14', bubble: 'rgba(11, 23, 37, 0.90)', bubbleMine: 'rgba(22, 75, 109, 0.85)' },
  { preset: 'obsidian', label: 'Obsidian', detail: 'Near-black neutral', page: '#05070B', bubble: 'rgba(18, 24, 33, 0.92)', bubbleMine: 'rgba(18, 52, 76, 0.9)' },
  { preset: 'aurora', label: 'Aurora', detail: 'Teal accent', page: '#040E16', bubble: 'rgba(11, 31, 38, 0.9)', bubbleMine: 'rgba(10, 79, 84, 0.75)' },
  { preset: 'graphite', label: 'Graphite', detail: 'Warm slate', page: '#0A0D12', bubble: 'rgba(23, 28, 35, 0.92)', bubbleMine: 'rgba(32, 53, 72, 0.82)' },
];

const FONTS: { preset: ChatFontFamily; label: string; detail: string; fontFamily?: string }[] = [
  { preset: 'system', label: 'System', detail: 'Default platform font', fontFamily: undefined },
  { preset: 'figtree', label: 'Figtree', detail: 'Modern geometric sans-serif', fontFamily: 'Figtree' },
  { preset: 'space-grotesk', label: 'Space Grotesk', detail: 'Geometric sans-serif', fontFamily: 'Space Grotesk' },
  { preset: 'instrument-serif', label: 'Instrument Serif', detail: 'Elegant serif font', fontFamily: 'Instrument Serif' },
  { preset: 'oswald', label: 'Oswald', detail: 'Condensed sans-serif', fontFamily: 'Oswald' },
  { preset: 'dancing-script', label: 'Dancing Script', detail: 'Playful handwriting style', fontFamily: 'Dancing Script' },
];

export default function AppearanceScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { appearanceSettings, updateAppearanceSettings } = useApp();
  const isWide = Platform.OS === 'web' && width >= 820;

  const active = WALLPAPERS.find((item) => item.preset === appearanceSettings.wallpaper) ?? WALLPAPERS[0];
  const fontSize = TEXT_SIZES.find((item) => item.preset === appearanceSettings.textSize)?.sample ?? 15;
  const fontOption = FONTS.find((item) => item.preset === appearanceSettings.fontFamily);
  const messageFontFamily = fontOption?.fontFamily;

  console.log('🎨 Appearance screen rendered', { textSize: appearanceSettings.textSize, wallpaper: appearanceSettings.wallpaper, fontSize, page: active.page });

  const handleTextSizeChange = async (preset: TextSizePreset) => {
    console.log('📝 Text size changed:', preset);
    await updateAppearanceSettings({ textSize: preset });
  };

  const handleWallpaperChange = async (preset: ChatWallpaperPreset) => {
    console.log('🎭 Wallpaper changed:', preset);
    await updateAppearanceSettings({ wallpaper: preset });
  };

  const handleFontFamilyChange = async (preset: ChatFontFamily) => {
    console.log('🔤 Font family changed:', preset);
    await updateAppearanceSettings({ fontFamily: preset });
  };

  const content = (
    <ScrollView contentContainerStyle={[styles.content, isWide && styles.webContent]}>
      {!isWide && (
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={23} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>Appearance</Text>
        </View>
      )}

      <Text style={styles.section}>PREVIEW</Text>
      <View style={[styles.preview, { backgroundColor: active.page }]}>
        <View style={[styles.bubble, styles.bubbleTheirs, { backgroundColor: active.bubble }]}>
          <Text style={[styles.bubbleText, { fontSize, lineHeight: fontSize + 6, fontFamily: messageFontFamily }]}>This is how received messages look.</Text>
        </View>
        <View style={[styles.bubble, styles.bubbleMine, { backgroundColor: active.bubbleMine }]}>
          <Text style={[styles.bubbleText, { fontSize, lineHeight: fontSize + 6, fontFamily: messageFontFamily }]}>And this is how yours look.</Text>
        </View>
      </View>

      <Text style={styles.section}>TEXT SIZE</Text>
      <Text style={styles.intro}>Applies to message text in every chat on this device.</Text>
      {TEXT_SIZES.map((option) => {
        const selected = appearanceSettings.textSize === option.preset;
        return (
          <Pressable
            key={option.preset}
            accessibilityRole="button"
            style={styles.row}
            onPress={() => handleTextSizeChange(option.preset)}
          >
            <View style={styles.icon}>
              <Text style={[styles.sizeGlyph, { fontSize: option.sample }]}>Aa</Text>
            </View>
            <View style={styles.copy}>
              <Text style={[styles.rowTitle, selected && styles.rowTitleActive]}>{option.label}</Text>
              <Text style={styles.detail}>{option.detail}</Text>
            </View>
            {selected && <Ionicons name="checkmark" size={20} color={colors.neon} />}
          </Pressable>
        );
      })}

      <Text style={styles.section}>CHAT BACKGROUND</Text>
      <Text style={styles.intro}>Dark-only presets. Applies to every conversation immediately.</Text>
      <View style={styles.grid}>
        {WALLPAPERS.map((option) => {
          const selected = appearanceSettings.wallpaper === option.preset;
          return (
            <Pressable
              key={option.preset}
              accessibilityRole="button"
              style={[styles.tile, selected && styles.tileActive]}
              onPress={() => handleWallpaperChange(option.preset)}
            >
              <View style={[styles.swatch, { backgroundColor: option.page }]}>
                <View style={[styles.swatchBubble, { backgroundColor: option.bubble }]} />
                <View style={[styles.swatchBubble, styles.swatchBubbleMine, { backgroundColor: option.bubbleMine }]} />
                {selected && (
                  <View style={styles.swatchCheck}>
                    <Ionicons name="checkmark" size={13} color={colors.navy950} />
                  </View>
                )}
              </View>
              <Text style={[styles.tileTitle, selected && styles.rowTitleActive]}>{option.label}</Text>
              <Text style={styles.detail}>{option.detail}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>MESSAGE FONT</Text>
      <Text style={styles.intro}>Choose a font style for message text in chats. Applies immediately.</Text>
      <View style={styles.fontGrid}>
        {FONTS.map((option) => {
          const selected = appearanceSettings.fontFamily === option.preset;
          return (
            <Pressable
              key={option.preset}
              accessibilityRole="button"
              style={[styles.fontTile, selected && styles.fontTileActive]}
              onPress={() => handleFontFamilyChange(option.preset)}
            >
              <Text style={[styles.fontPreview, { fontFamily: option.fontFamily }]}>Aa</Text>
              <Text style={[styles.fontTitle, selected && styles.rowTitleActive]}>{option.label}</Text>
              <Text style={styles.detail}>{option.detail}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.info}>
        <Ionicons name="color-palette-outline" size={24} color={colors.neon} />
        <View style={styles.copy}>
          <Text style={styles.infoTitle}>Stored on this device</Text>
          <Text style={styles.detail}>Appearance is a local preference and is never uploaded or shared with contacts.</Text>
        </View>
      </View>
    </ScrollView>
  );

  if (isWide) return <WebSettingsShell activeId="appearance" title="Appearance" subtitle="Text size and chat background presets">{content}</WebSettingsShell>;
  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  webContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  back: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontSize: 27, fontWeight: '900' },
  section: { color: colors.blue, fontSize: 11, fontWeight: '900', marginTop: 20, marginBottom: 8 },
  intro: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  preview: { borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  bubble: { maxWidth: '85%', paddingHorizontal: 13, paddingTop: 9, paddingBottom: 6, borderRadius: 17, borderWidth: 1, boxShadow: '0 4px 8px rgba(0,0,0,0.15)', elevation: 5 },
  bubbleTheirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderColor: 'rgba(120, 204, 255, 0.15)' },
  bubbleMine: { alignSelf: 'flex-end', borderBottomRightRadius: 4, borderColor: 'rgba(120, 204, 255, 0.25)' },
  bubbleText: { color: colors.white },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 38, height: 38, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  sizeGlyph: { color: colors.blue, fontWeight: '800' },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  rowTitleActive: { color: colors.neon },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 164, borderWidth: 1, borderColor: colors.border, padding: 10 },
  tileActive: { borderColor: colors.neon },
  tileTitle: { color: colors.white, fontSize: 13, fontWeight: '800', marginTop: 9 },
  swatch: { height: 78, padding: 8, justifyContent: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  swatchBubble: { width: '62%', height: 14, alignSelf: 'flex-start' },
  swatchBubbleMine: { width: '52%', alignSelf: 'flex-end' },
  swatchCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  fontGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fontTile: { flex: 1, minWidth: 148, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center' },
  fontTileActive: { borderColor: colors.neon },
  fontPreview: { fontSize: 28, fontWeight: '700', color: colors.white, marginBottom: 8 },
  fontTitle: { color: colors.white, fontSize: 12, fontWeight: '800', marginBottom: 2, textAlign: 'center' },
  info: { marginTop: 24, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoTitle: { color: colors.neon, fontSize: 14, fontWeight: '900' },
});
