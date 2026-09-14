import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Avatar, DEFAULT_PROFILE_AVATARS } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { SignOutModal } from '@/components/SignOutModal';
import { WebSettings } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { copyToClipboard } from '@/lib/id';
import { colors } from '@/theme/colors';

const statusOptions = [
  { value: 'online', label: 'Online', color: colors.neon },
  { value: 'busy', label: 'Busy', color: '#FFB84D' },
  { value: 'away', label: 'Away', color: '#7AC7FF' },
  { value: 'offline', label: 'Offline', color: '#9CB2CC' },
] as const;

const items: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; route?: '/security/privacy' | '/security/appearance' | '/security/notifications' | '/security/storage' }[] = [
  { icon: 'shield-checkmark-outline', title: 'Privacy', detail: 'Typing activity, calls and identity protection', route: '/security/privacy' },
  { icon: 'notifications-outline', title: 'Notifications', detail: 'Messages, groups and calls', route: '/security/notifications' },
  { icon: 'color-palette-outline', title: 'Appearance', detail: 'Dark navy theme', route: '/security/appearance' },
  { icon: 'server-outline', title: 'Data and storage', detail: 'Media quality and network usage', route: '/security/storage' },
];

export default function SettingsScreen() {
  const { width } = useWindowDimensions();
  const { profile, backendMode, signOut, updateProfilePicture, updateProfileStatus, updateProfileDisplayName } = useApp();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
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

  const handleSignOutConfirm = async () => {
    try {
      console.log('[settings] Confirming sign out - closing modal');
      setShowSignOutModal(false);
      setIsSigningOut(true);

      if (Platform.OS === 'web') {
        console.log('[settings] Redirecting away before clearing identity state');
        window.location.href = '/';
      } else {
        console.log('[settings] Navigating away before clearing identity state');
        router.replace('/');
      }

      console.log('[settings] Calling signOut()');
      await signOut();
      console.log('[settings] Signed out successfully');
    } catch (error: any) {
      console.error('[settings] Sign out error:', error);
      Alert.alert('Sign out failed', error?.message || 'An error occurred');
      setIsSigningOut(false);
      setShowSignOutModal(true);
    }
  };

  const handleSignOutCancel = () => {
    console.log('[settings] Cancelling sign out');
    setShowSignOutModal(false);
  };

  const handleEditName = () => {
    setEditingName(profile?.displayName || '');
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    try {
      if (!editingName.trim()) {
        Alert.alert('Invalid name', 'Enter at least two characters.');
        return;
      }
      await updateProfileDisplayName(editingName);
      setIsEditingName(false);
      Alert.alert('Name updated', 'Your display name has been changed.');
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditingName('');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.profile}>
          <Pressable onPress={pickProfilePicture} style={styles.avatarButton}>
            <Avatar name={profile.displayName} color={profile.avatarColor} size={64} online imageUrl={profile.avatarUrl} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.name}>{profile.displayName}</Text>
              <Pressable onPress={handleEditName} style={{ padding: 4 }}>
                <Ionicons name="pencil-outline" size={16} color={colors.blue} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => copyToClipboard(profile.macroId)}
            >
              <Text style={styles.id}>{profile.macroId}  <Ionicons name="copy-outline" size={13} /></Text>
            </Pressable>
            <Text style={[styles.mode, { color: statusOptions.find((option) => option.value === profile.status)?.color ?? colors.neon }]}>● {statusOptions.find((option) => option.value === profile.status)?.label ?? 'Online'}</Text>
          </View>
        </View>

        {isEditingName && (
          <View style={styles.editNameSection}>
            <Text style={styles.editNameLabel}>Edit display name</Text>
            <TextInput
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Your display name"
              placeholderTextColor={colors.muted}
              style={styles.editNameInput}
              maxLength={32}
              autoFocus
            />
            <View style={styles.editNameButtons}>
              <Pressable onPress={handleSaveName} style={[styles.editNameButton, styles.editNameButtonPrimary]}>
                <Text style={styles.editNameButtonText}>Save</Text>
              </Pressable>
              <Pressable onPress={handleCancelEdit} style={[styles.editNameButton, styles.editNameButtonSecondary]}>
                <Text style={[styles.editNameButtonText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.statusPicker}>
          <Text style={styles.avatarTitle}>Status</Text>
          <View style={styles.statusOptionsRow}>
            {statusOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => void updateProfileStatus(option.value)}
                style={[styles.statusOption, profile.status === option.value && styles.statusOptionActive]}
              >
                <View style={[styles.statusDot, { backgroundColor: option.color }]} />
                <Text style={[styles.statusOptionText, profile.status === option.value && styles.statusOptionTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
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
              onPress={() => copyToClipboard(profile.macroId, 'Copied ID')}
            >
              <Ionicons name="copy-outline" color={colors.white} size={16} />
              <Text style={styles.qrActionText}>Copy ID</Text>
            </Pressable>
            <Pressable
              style={styles.qrActionBtn}
              onPress={() => copyToClipboard(qrPayload, 'QR payload copied')}
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
            <Text style={styles.detail}>Secure your account with an authenticator code</Text>
          </View>
          <Ionicons name="chevron-forward" color={colors.muted} size={18} />
        </Pressable>

        <Pressable style={styles.reset} onPress={() => setShowSignOutModal(true)} disabled={isSigningOut}>
          <Ionicons name="refresh" color={colors.danger} size={19} />
          <Text style={styles.resetText}>Reset anonymous identity</Text>
        </Pressable>
        <SignOutModal
          visible={showSignOutModal}
          onConfirm={handleSignOutConfirm}
          onCancel={handleSignOutCancel}
          isLoading={isSigningOut}
        />

        <Text style={styles.version}>MacroChat MVP · Built for private, fast conversations</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 100 },
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
  mode: { fontSize: 10, marginTop: 5 },
  statusPicker: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.navy900,
  },
  statusOptionActive: { borderColor: colors.neon, backgroundColor: 'rgba(57, 255, 20, 0.08)' },
  statusOptionText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  statusOptionTextActive: { color: colors.neon },
  statusDot: { width: 8, height: 8, borderRadius: 99 },
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
  editNameSection: {
    marginHorizontal: 20,
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.navy800,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editNameLabel: { color: colors.white, fontWeight: '800', fontSize: 14, marginBottom: 10 },
  editNameInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.navy900,
    paddingHorizontal: 14,
    color: colors.white,
    fontSize: 16,
    marginBottom: 12,
  },
  editNameButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editNameButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editNameButtonPrimary: {
    backgroundColor: colors.blue,
  },
  editNameButtonSecondary: {
    backgroundColor: colors.navy900,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editNameButtonText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
