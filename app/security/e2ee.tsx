import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useApp } from '@/context/AppContext';
import { colors } from '@/theme/colors';

export default function E2EEScreen() {
  const router = useRouter();
  const { e2eeEnabled, enableE2EE, disableE2EE, unlockE2EE } = useApp();
  const [passphrase, setPassphrase] = useState('');

  const onEnable = async () => {
    if (passphrase.trim().length < 8) return Alert.alert('Weak passphrase', 'Use at least 8 characters.');
    await enableE2EE(passphrase);
    setPassphrase('');
    Alert.alert('E2EE enabled', 'New outgoing messages will be encrypted in phase 1 mode.');
  };

  const onUnlock = async () => {
    const ok = await unlockE2EE(passphrase);
    if (!ok) return Alert.alert('Unlock failed', 'Use the same passphrase used for encryption.');
    setPassphrase('');
    Alert.alert('E2EE unlocked', 'Encrypted messages can be decrypted on this device.');
  };

  const onDisable = async () => {
    await disableE2EE();
    Alert.alert('E2EE disabled', 'New messages will be sent without phase 1 encryption payloads.');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={23} color={colors.white} /></Pressable>
          <Text style={styles.title}>E2EE Phase 1</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.caption}>Status</Text>
          <Text style={[styles.state, { color: e2eeEnabled ? colors.neon : colors.danger }]}>{e2eeEnabled ? 'Enabled' : 'Disabled'}</Text>
          <Text style={styles.note}>Phase 1 encrypts message payloads client-side with a passphrase-derived key.</Text>
        </View>

        <Text style={styles.section}>Passphrase</Text>
        <TextInput
          value={passphrase}
          onChangeText={setPassphrase}
          placeholder="Enter secure passphrase"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
        />

        <Pressable style={styles.primary} onPress={onEnable}><Text style={styles.primaryText}>Enable E2EE</Text></Pressable>
        <Pressable style={styles.secondary} onPress={onUnlock}><Text style={styles.secondaryText}>Unlock Existing E2EE</Text></Pressable>
        <Pressable style={styles.danger} onPress={onDisable}><Text style={styles.dangerText}>Disable E2EE</Text></Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  back: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.navy800, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontWeight: '900', fontSize: 30 },
  card: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, borderRadius: 16, padding: 14, marginBottom: 16 },
  caption: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  state: { marginTop: 8, fontSize: 22, fontWeight: '900' },
  note: { color: colors.muted, marginTop: 6, fontSize: 12 },
  section: { color: colors.blue, fontWeight: '800', fontSize: 12, letterSpacing: 1.2, marginBottom: 8 },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.navy800, color: colors.white, paddingHorizontal: 14, fontSize: 15 },
  primary: { marginTop: 10, height: 50, borderRadius: 14, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.black, fontWeight: '900' },
  secondary: { marginTop: 10, height: 50, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.black, fontWeight: '900' },
  danger: { marginTop: 10, height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontWeight: '900' },
});
