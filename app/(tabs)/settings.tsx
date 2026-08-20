import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

const items: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }[] = [
  { icon: 'shield-checkmark-outline', title: 'Privacy', detail: 'Blocked users, receipts, disappearing messages' },
  { icon: 'notifications-outline', title: 'Notifications', detail: 'Messages, groups and calls' },
  { icon: 'color-palette-outline', title: 'Appearance', detail: 'Dark navy theme' },
  { icon: 'key-outline', title: 'Linked devices', detail: 'Manage trusted sessions' },
  { icon: 'server-outline', title: 'Data and storage', detail: 'Media quality and network usage' },
];

export default function SettingsScreen() {
  const { profile, backendMode, signOut, mfaAal2, e2eeEnabled } = useApp();
  if (!profile) return null;
  const qrPayload = `macrochat://add?macroId=${encodeURIComponent(profile.macroId)}`;

  const reset = () => Alert.alert(
    'Reset identity?',
    'This removes the anonymous ID from this device.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ],
  );

  return (
    <Screen>
      <ScrollView>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.profile}>
          <Avatar name={profile.displayName} color={profile.avatarColor} size={64} online />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile.displayName}</Text>
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(profile.macroId);
                Alert.alert('Copied', profile.macroId);
              }}
            >
              <Text style={styles.id}>{profile.macroId}  <Ionicons name="copy-outline" size={13} /></Text>
            </Pressable>
            <Text style={styles.mode}>{backendMode === 'supabase' ? '● Online mode' : '● Offline mode'}</Text>
          </View>
        </View>

        <View style={styles.qrCard}>
          <View style={styles.qrHeader}>
            <Ionicons name="qr-code" color={colors.blue} size={20} />
            <Text style={styles.qrTitle}>Your Macro QR</Text>
          </View>
          <View style={styles.qrWrap}>
            <QRCode value={qrPayload} size={160} color={colors.navy950} backgroundColor={colors.white} />
          </View>
          <Text style={styles.qrHint}>Others can scan this QR to start a private chat with your Macro ID.</Text>
          <View style={styles.qrActions}>
            <Pressable
              style={styles.qrActionBtn}
              onPress={async () => {
                await Clipboard.setStringAsync(profile.macroId);
                Alert.alert('Copied', profile.macroId);
              }}
            >
              <Ionicons name="copy-outline" color={colors.white} size={16} />
              <Text style={styles.qrActionText}>Copy ID</Text>
            </Pressable>
            <Pressable
              style={styles.qrActionBtn}
              onPress={async () => {
                await Clipboard.setStringAsync(qrPayload);
                Alert.alert('Copied', 'QR payload copied to clipboard.');
              }}
            >
              <Ionicons name="link-outline" color={colors.white} size={16} />
              <Text style={styles.qrActionText}>Copy QR Link</Text>
            </Pressable>
          </View>
        </View>

        {items.map((item) => (
          <Pressable key={item.title} style={styles.row}>
            <View style={styles.itemIcon}><Ionicons name={item.icon} color={colors.blue} size={22} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" color={colors.muted} size={18} />
          </Pressable>
        ))}

        <Pressable style={styles.row} onPress={() => router.push('/security/mfa')}>
          <View style={styles.itemIcon}><Ionicons name="shield-checkmark" color={colors.neon} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>Two-factor authentication</Text>
            <Text style={styles.detail}>{mfaAal2 ? 'Verified (AAL2)' : 'Enroll and verify authenticator code'}</Text>
          </View>
          <Ionicons name="chevron-forward" color={colors.muted} size={18} />
        </Pressable>

        <Pressable style={styles.row} onPress={() => router.push('/security/e2ee')}>
          <View style={styles.itemIcon}><Ionicons name="lock-closed" color={colors.blue} size={20} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>Message encryption</Text>
            <Text style={styles.detail}>{e2eeEnabled ? 'Phase 1 E2EE enabled' : 'Manage phase 1 end-to-end encryption'}</Text>
          </View>
          <Ionicons name="chevron-forward" color={colors.muted} size={18} />
        </Pressable>

        <Pressable style={styles.reset} onPress={reset}>
          <Ionicons name="refresh" color={colors.danger} size={19} />
          <Text style={styles.resetText}>Reset anonymous identity</Text>
        </Pressable>

        <Text style={styles.version}>MacroChat MVP · Built for private, fast conversations</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 32, fontWeight: '900', margin: 20, marginTop: 18 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginBottom: 22,
    padding: 17,
    borderRadius: 20,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.white, fontSize: 18, fontWeight: '900' },
  id: { color: colors.blue, fontSize: 12, fontWeight: '700', marginTop: 4 },
  mode: { color: colors.neon, fontSize: 10, marginTop: 5 },
  qrCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  qrTitle: { color: colors.white, fontWeight: '900', fontSize: 16 },
  qrWrap: {
    marginTop: 12,
    alignSelf: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
  },
  qrHint: { marginTop: 10, color: colors.muted, fontSize: 12, textAlign: 'center' },
  qrActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  qrActionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.navy900,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  qrActionText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  row: {
    marginHorizontal: 20,
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.navy800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { color: colors.white, fontWeight: '800', fontSize: 15 },
  detail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  reset: {
    margin: 20,
    marginTop: 28,
    height: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#5C2940',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  resetText: { color: colors.danger, fontWeight: '800' },
  version: { color: colors.muted, textAlign: 'center', fontSize: 11, marginBottom: 40 },
});
