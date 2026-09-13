import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';
import { useState } from 'react';

export default function DataStorageScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { profile } = useApp();
  const isWide = Platform.OS === 'web' && width >= 820;

  const [autoDownload, setAutoDownload] = useState(true);
  const [googleDriveConnected, setGoogleDriveConnected] = useState(false);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupInProgress, setBackupInProgress] = useState(false);

  const handleConnectGoogleDrive = async () => {
    // Placeholder for Google Drive OAuth flow
    Alert.alert('Google Drive Connection', 'Redirecting to Google login...', [
      {
        text: 'Cancel',
        onPress: () => console.log('Cancelled'),
        style: 'cancel',
      },
      {
        text: 'Continue',
        onPress: async () => {
          // In production: Implement Google OAuth flow
          // 1. Open OAuth consent screen
          // 2. Get authorization code
          // 3. Exchange for access token
          // 4. Store token in SecureStore
          console.log('🔐 Opening Google Drive OAuth...');
          setGoogleDriveConnected(true);
          Alert.alert('Connected', 'Google Drive account connected successfully!');
        },
      },
    ]);
  };

  const handleDisconnectGoogleDrive = () => {
    Alert.alert('Disconnect Google Drive', 'This will stop automatic backups. Existing backups remain in your Drive.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          setGoogleDriveConnected(false);
          setBackupEnabled(false);
          console.log('🗑️ Google Drive disconnected');
        },
      },
    ]);
  };

  const handleEnableBackup = async () => {
    if (!googleDriveConnected) {
      Alert.alert('Connect First', 'Please connect your Google account first.');
      return;
    }

    Alert.alert(
      'Enable Backup',
      `Allow MacroChat to backup all chats and media to your Google Drive?\n\nBackup will include:\n• Message history\n• Images and videos\n• Voice notes\n• Call logs`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enable Backup',
          style: 'default',
          onPress: async () => {
            setBackupInProgress(true);
            console.log('💾 Starting backup to Google Drive...');
            // Simulate backup
            setTimeout(() => {
              setBackupInProgress(false);
              setBackupEnabled(true);
              Alert.alert('Backup Enabled', 'Your chats and media will be backed up automatically.');
            }, 2000);
          },
        },
      ]
    );
  };

  const content = (
    <ScrollView contentContainerStyle={[styles.content, isWide && styles.webContent]}>
      {!isWide && (
        <View style={styles.header}>
          <Pressable accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={23} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>Data & Storage</Text>
        </View>
      )}

      <Text style={styles.section}>MEDIA MANAGEMENT</Text>
      <Text style={styles.intro}>Control how media files are handled on your device.</Text>

      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="download-outline" size={20} color={colors.blue} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.rowTitle}>Auto-download media</Text>
          <Text style={styles.detail}>Automatically download images and videos from contacts. Uses mobile data.</Text>
        </View>
        <Pressable style={[styles.toggle, autoDownload && styles.toggleActive]} onPress={() => setAutoDownload(!autoDownload)}>
          <View style={[styles.toggleThumb, autoDownload && styles.toggleThumbActive]} />
        </Pressable>
      </View>

      <Text style={styles.section}>CLOUD BACKUP</Text>
      <Text style={styles.intro}>Securely backup your chats and media to Google Drive.</Text>

      {!googleDriveConnected ? (
        <Pressable style={styles.connectButton} onPress={handleConnectGoogleDrive}>
          <Ionicons name="logo-google" size={18} color={colors.white} />
          <Text style={styles.connectButtonText}>Connect Google Drive</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ) : (
        <>
          <View style={styles.connectedBox}>
            <View style={styles.connectedHeader}>
              <Ionicons name="checkmark-circle" size={24} color={colors.neon} />
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>Connected</Text>
                <Text style={styles.detail}>{profile?.displayName || 'Google account'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.icon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.blue} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>Backup chats & media</Text>
              <Text style={styles.detail}>
                {backupEnabled ? 'Enabled - backing up automatically' : 'Enable automatic backup to Google Drive'}
              </Text>
            </View>
            <Pressable
              style={[styles.toggle, backupEnabled && styles.toggleActive]}
              onPress={() => {
                if (!backupEnabled) {
                  handleEnableBackup();
                } else {
                  setBackupEnabled(false);
                }
              }}
            >
              <View style={[styles.toggleThumb, backupEnabled && styles.toggleThumbActive]} />
            </Pressable>
          </View>

          {backupInProgress && (
            <View style={styles.progressBox}>
              <Ionicons name="sync" size={16} color={colors.blue} />
              <Text style={styles.detail}>Backup in progress...</Text>
            </View>
          )}

          <Pressable style={styles.disconnectButton} onPress={handleDisconnectGoogleDrive}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.disconnectButtonText}>Disconnect Google Drive</Text>
          </Pressable>
        </>
      )}

      <View style={styles.info}>
        <Ionicons name="information-circle-outline" size={24} color={colors.neon} />
        <View style={styles.copy}>
          <Text style={styles.infoTitle}>End-to-end encrypted</Text>
          <Text style={styles.detail}>Your backup is encrypted and only accessible from your account. We cannot see your data.</Text>
        </View>
      </View>
    </ScrollView>
  );

  if (isWide) return <WebSettingsShell activeId="storage" title="Data & Storage" subtitle="Manage backups and media downloads">{content}</WebSettingsShell>;
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
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 8 },
  icon: { width: 38, height: 38, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.white, fontSize: 14, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.navy800, padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: colors.neon },
  toggleThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white },
  toggleThumbActive: { alignSelf: 'flex-end', backgroundColor: colors.navy950 },
  connectButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.navy800, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, marginBottom: 16 },
  connectButtonText: { flex: 1, color: colors.white, fontSize: 14, fontWeight: '700' },
  connectedBox: { minHeight: 60, backgroundColor: 'rgba(57, 255, 20, 0.05)', borderWidth: 1, borderColor: 'rgba(57, 255, 20, 0.2)', borderRadius: 8, padding: 14, marginBottom: 16 },
  connectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.navy800, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 8, padding: 12, marginBottom: 12 },
  disconnectButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255, 61, 61, 0.1)', borderWidth: 1, borderColor: 'rgba(255, 61, 61, 0.3)', borderRadius: 8, paddingHorizontal: 14 },
  disconnectButtonText: { flex: 1, color: colors.danger, fontSize: 14, fontWeight: '700' },
  info: { marginTop: 24, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8 },
  infoTitle: { color: colors.neon, fontSize: 14, fontWeight: '900' },
});
