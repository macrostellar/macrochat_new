import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Avatar, DEFAULT_PROFILE_AVATARS } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { WebSettings } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { getAccountRecoveryState } from '@/lib/supabase';
import { colors } from '@/theme/colors';

const items: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; route?: '/security/privacy' | '/(tabs)/settings-e2ee' }[] = [
  { icon: 'lock-closed-outline', title: 'Encryption', detail: 'View & manage encryption keys', route: '/(tabs)/settings-e2ee' },
  { icon: 'shield-checkmark-outline', title: 'Privacy', detail: 'Typing activity, calls and identity protection', route: '/security/privacy' },
  { icon: 'notifications-outline', title: 'Notifications', detail: 'Messages, groups and calls' },
  { icon: 'color-palette-outline', title: 'Appearance', detail: 'Dark navy theme' },
  { icon: 'key-outline', title: 'Linked devices', detail: 'Manage trusted sessions' },
  { icon: 'server-outline', title: 'Data and storage', detail: 'Media quality and network usage' },
];

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const { profile, backendMode, signOut, mfaAal2, e2eeEnabled, updateProfilePicture } = useApp();
  if (Platform.OS === 'web' && width >= 820) return <WebSettings />;
  if (!profile) return null;
  const qrPayload = `macrochat://add?macroId=${encodeURIComponent(profile.macroId)}`;

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
    let recoverable = false;
    try {
      recoverable = (await getAccountRecoveryState()).recoverable;
    } catch {
      // Use the safer warning when account status cannot be checked.
    }

    Alert.alert(
      recoverable ? 'Sign out on this device?' : 'Permanently reset identity?',
      recoverable
        ? 'You can restore this Macro ID using a connected recovery method.'
        : 'No email, phone, or Google account is connected. Resetting will permanently lose access to this Macro ID and its chats.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: recoverable ? 'Sign out' : 'Reset permanently',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.profile}>
          <Pressable onPress={pickProfilePicture} style={styles.avatarButton}>
            <Avatar name={profile.displayName} color={profile.avatarColor} size={64} online imageUrl={profile.avatarUrl} />
          </Pressable>
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

        <View style={styles.avatarPicker}>
          <Text style={styles.avatarTitle}>Choose a profile photo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarScrollContainer}>
            <View style={styles.defaultAvatarRow}>
              {DEFAULT_PROFILE_AVATARS.map((url) => (
                <Pressable key={url} onPress={async () => { await updateProfilePicture(url); }}>
                  <Avatar name={profile.displayName} color={profile.avatarColor} size={40} imageUrl={url} />
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Pressable style={styles.uploadButton} onPress={pickProfilePicture}>
            <Ionicons name="cloud-upload-outline" size={16} color={colors.white} />
            <Text style={styles.uploadText}>Upload custom photo</Text>
          </Pressable>
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
          <Pressable key={item.title} style={styles.row} onPress={() => item.route && router.push(item.route)} disabled={!item.route}>
            <View style={styles.itemIcon}><Ionicons name={item.icon} color={colors.blue} size={22} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.detail}>{item.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" color={colors.muted} size={18} />
          </Pressable>
        ))}

        <Pressable style={styles.row} onPress={() => router.push('/security/account')}>
          <View style={styles.itemIcon}><Ionicons name="person-circle-outline" color={colors.blue} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>Account and recovery</Text>
            <Text style={styles.detail}>Username-only, email, phone, or Google</Text>
          </View>
          <Ionicons name="chevron-forward" color={colors.muted} size={18} />
        </Pressable>

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
    marginBottom: 12,
    padding: 17,
    borderRadius: 20,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarButton: { borderRadius: 32, overflow: 'hidden' },
  avatarPicker: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarTitle: { color: colors.white, fontWeight: '800', fontSize: 14, marginBottom: 10 },
  defaultAvatarRow: { flexDirection: 'row', gap: 12, paddingVertical: 6 },
  avatarScrollContainer: { marginHorizontal: -14 },
  uploadButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.blue,
  },
  uploadText: { color: colors.white, fontSize: 12, fontWeight: '800' },
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
