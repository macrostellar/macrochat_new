import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { WebSettingsShell } from '@/components/WebSections';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

export default function E2EEScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { e2eeEnabled, enableE2EE, disableE2EE, unlockE2EE } = useApp();
  const [passphrase, setPassphrase] = useState('');
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onEnable = async () => {
    if (passphrase.trim().length < 12) return setNotice({ error: true, text: 'Use at least 12 characters for the encryption passphrase.' });
    setBusy(true);
    try {
      await enableE2EE(passphrase);
      setPassphrase('');
      setNotice({ error: false, text: 'Encryption enabled. New outgoing text messages will use this device key.' });
    } finally {
      setBusy(false);
    }
  };

  const onUnlock = async () => {
    if (!passphrase.trim()) return setNotice({ error: true, text: 'Enter the passphrase originally used on this device.' });
    setBusy(true);
    const ok = await unlockE2EE(passphrase);
    setBusy(false);
    if (!ok) return setNotice({ error: true, text: 'That passphrase does not match this device encryption key.' });
    setPassphrase('');
    setNotice({ error: false, text: 'Encryption unlocked. Encrypted messages can now be decrypted on this device.' });
  };

  const onDisable = async () => {
    await disableE2EE();
    setPassphrase('');
    setNotice({ error: false, text: 'Encryption is locked on this device. Enter the same passphrase to unlock it.' });
  };

  const content = (
      <ScrollView contentContainerStyle={[styles.content, Platform.OS === 'web' && width >= 820 && styles.webContent]}>
        {!(Platform.OS === 'web' && width >= 820) && (
        <View style={styles.headerRow}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={23} color={colors.white} /></Pressable>
          <Text style={styles.title}>E2EE Phase 1</Text>
        </View>
        )}

        <View style={styles.card}>
          <Text style={styles.caption}>Status</Text>
          <Text style={[styles.state, { color: e2eeEnabled ? colors.neon : colors.danger }]}>{e2eeEnabled ? 'Enabled' : 'Disabled'}</Text>
          <Text style={styles.note}>Phase 1 encrypts message payloads client-side with a passphrase-derived key.</Text>
        </View>

        <Text style={styles.section}>Passphrase</Text>
        {notice && <View style={[styles.notice, { borderColor: notice.error ? colors.danger : colors.neon }]}><Ionicons name={notice.error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={20} color={notice.error ? colors.danger : colors.neon} /><Text style={styles.noticeText}>{notice.text}</Text></View>}
        <TextInput
          value={passphrase}
          onChangeText={setPassphrase}
          placeholder="Enter secure passphrase"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
        />

        <Pressable accessibilityRole="button" style={[styles.primary, (busy || e2eeEnabled) && styles.disabled]} onPress={onEnable} disabled={busy || e2eeEnabled}><Text style={styles.primaryText}>Enable E2EE</Text></Pressable>
        <Pressable accessibilityRole="button" style={[styles.secondary, (busy || e2eeEnabled) && styles.disabled]} onPress={onUnlock} disabled={busy || e2eeEnabled}><Text style={styles.secondaryText}>Unlock Existing E2EE</Text></Pressable>
        <Pressable accessibilityRole="button" style={[styles.danger, (busy || !e2eeEnabled) && styles.disabled]} onPress={onDisable} disabled={busy || !e2eeEnabled}><Text style={styles.dangerText}>Lock E2EE on this device</Text></Pressable>
      </ScrollView>
  );

  if (Platform.OS === 'web' && width >= 820) {
    return <WebSettingsShell activeId="e2ee" title="Message encryption" subtitle="Manage this device's message encryption passphrase">{content}</WebSettingsShell>;
  }

  return <Screen>{content}</Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  webContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  back: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontWeight: '900', fontSize: 30 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 16, padding: 14, marginBottom: 16 },
  caption: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  state: { marginTop: 8, fontSize: 22, fontWeight: '900' },
  note: { color: colors.muted, marginTop: 6, fontSize: 12 },
  section: { color: colors.blue, fontWeight: '800', fontSize: 12, letterSpacing: 1.2, marginBottom: 8 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 14, fontSize: 15 },
  notice: { borderWidth: 1, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { color: colors.white, fontSize: 12, lineHeight: 18, flex: 1 },
  disabled: { opacity: 0.45 },
  primary: { marginTop: 10, height: 50, borderRadius: 14, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.black, fontWeight: '900' },
  secondary: { marginTop: 10, height: 50, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.black, fontWeight: '900' },
  danger: { marginTop: 10, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900' },
});
